"""빈 결과 캐시의 조회 분기·TTL·오류 격리를 실제 DB 없이 검증한다."""
from datetime import timedelta
import unittest
from unittest.mock import MagicMock, patch

import psycopg2

from app.crud import nearby


class TestEmptyCache(unittest.TestCase):
    def make_conn(self, empty_hit=False, has_route=True):
        conn = MagicMock()
        cursor = conn.cursor.return_value.__enter__.return_value
        cursor.fetchall.return_value = []
        cursor.fetchone.side_effect = lambda: (
            ((1,) if has_route else None)
            if "FROM course_waypoint" in cursor.execute.call_args.args[0]
            else ((1,) if empty_hit else None)
        )
        return conn, cursor

    def test_missing_route_does_not_cache_empty_result(self):
        for category in ("attraction", "restaurant", "accommodation", "bicycle"):
            for route in ("trail", "bicycle"):
                with self.subTest(category=category, route=route):
                    conn, cursor = self.make_conn(has_route=False)
                    fetch = "_fetch_bicycle_live" if category == "bicycle" else "_fetch_live"
                    with (
                        patch.object(nearby, fetch, return_value=[]),
                        patch.object(nearby, "execute_values") as insert,
                    ):
                        total, rows, _ = nearby.list_nearby_spots(
                            conn, 5, category, route, strict_cache=True,
                        )
                    self.assertEqual((total, rows), (0, []))
                    self.assertEqual(cursor.execute.call_args.args[1], {
                        "course_id": 5, "route_type": route,
                    })
                    insert.assert_not_called()
                    conn.commit.assert_not_called()
                    self.assertFalse(any(
                        call.args[0] == nearby._DELETE_STALE_CACHE_SQL
                        for call in cursor.execute.call_args_list
                    ))

    def test_empty_hit_skips_live_query_and_does_not_extend_ttl(self):
        for category in ("attraction", "restaurant", "accommodation", "bicycle"):
            for route in ("trail", "bicycle"):
                with self.subTest(category=category, route=route):
                    conn, cursor = self.make_conn(True)
                    with (
                        patch.object(nearby, "_fetch_live") as live,
                        patch.object(nearby, "_fetch_bicycle_live") as bicycle,
                        patch.object(nearby, "_refresh_cache") as refresh,
                    ):
                        total, rows, version = nearby.list_nearby_spots(conn, 5, category, route)
                    self.assertEqual((total, rows), (0, []))
                    self.assertEqual(version, nearby._make_list_version(5, category, route, []))
                    live.assert_not_called()
                    bicycle.assert_not_called()
                    refresh.assert_not_called()
                    self.assertEqual(cursor.execute.call_args.args[1], {
                        "course_id": "5", "category": category, "route_type": route,
                        "empty_id": nearby._EMPTY_CONTENT_ID,
                    })

    def test_missing_or_expired_marker_recalculates_and_stores_thirty_days(self):
        # DB의 만료 조건으로 표시 행이 반환되지 않는 경우를 모의한다.
        for category in ("attraction", "restaurant", "accommodation", "bicycle"):
            with self.subTest(category=category):
                conn, cursor = self.make_conn()
                fetch = "_fetch_bicycle_live" if category == "bicycle" else "_fetch_live"
                with (
                    patch.object(nearby, fetch, return_value=[]) as live,
                    patch.object(nearby, "execute_values") as insert,
                ):
                    total, rows, _ = nearby.list_nearby_spots(conn, 5, category, strict_cache=True)
                self.assertEqual((total, rows), (0, []))
                live.assert_called_once()
                sql, values = insert.call_args.args[1:]
                self.assertEqual(sql, nearby._UPSERT_CACHE_SQL)
                self.assertEqual(len(values), 1)
                self.assertEqual(values[0][:6], (
                    "course", "5", category, nearby._EMPTY_CONTENT_ID, "trail", 0,
                ))
                self.assertEqual(values[0][-1] - values[0][-2], timedelta(days=30))
                conn.commit.assert_called_once()

    def test_forced_refresh_records_empty_result_for_both_routes(self):
        for route in ("trail", "bicycle"):
            for category in ("attraction", "restaurant", "accommodation", "bicycle"):
                with self.subTest(route=route, category=category):
                    conn, _ = self.make_conn(has_route=True)
                    fetch = "_fetch_bicycle_live" if category == "bicycle" else "_fetch_live"
                    with (
                        patch.object(nearby, fetch, return_value=[]),
                        patch.object(nearby, "execute_values") as insert,
                    ):
                        nearby.list_nearby_spots(conn, 5, category, route,
                                                 force_refresh=True, strict_cache=True)
                    value = insert.call_args.args[2][0]
                    self.assertEqual(value[3], nearby._EMPTY_CONTENT_ID)
                    self.assertEqual(value[4], route)
                    self.assertEqual(value[-1] - value[-2], timedelta(days=30))
                    conn.commit.assert_called_once()

    def test_live_failure_never_creates_empty_marker(self):
        for category in ("attraction", "bicycle"):
            conn, _ = self.make_conn()
            fetch = "_fetch_bicycle_live" if category == "bicycle" else "_fetch_live"
            with (
                patch.object(nearby, fetch, side_effect=psycopg2.OperationalError("query")),
                patch.object(nearby, "_refresh_cache") as refresh,
            ):
                with self.assertRaises(psycopg2.OperationalError):
                    nearby.list_nearby_spots(conn, 5, category)
            refresh.assert_not_called()
            conn.commit.assert_not_called()

    def test_nonempty_refresh_removes_empty_marker(self):
        conn, cursor = self.make_conn()
        with patch.object(nearby, "execute_values") as insert:
            nearby._refresh_cache(conn, 5, "bicycle", "trail", [
                {"content_id": "A", "distance_m": 1001.0},
            ], strict_cache=True)
        self.assertEqual(cursor.execute.call_args.args[0], nearby._DELETE_STALE_CACHE_SQL)
        values = insert.call_args.args[2]
        self.assertEqual([value[3] for value in values], ["A"])
        self.assertEqual(values[0][-1] - values[0][-2], timedelta(days=30))
        conn.commit.assert_called_once()

    def test_positive_cache_takes_precedence(self):
        conn, cursor = self.make_conn(True)
        cursor.fetchall.return_value = [{
            "nearby_content_id": "A", "distance_km": 1.001, "name": "A",
            "address": None, "image_url": None, "lat": 37.0, "lng": 127.0,
        }]
        with patch.object(nearby, "_has_empty_cache") as empty:
            total, rows, _ = nearby.list_nearby_spots(conn, 5, "attraction")
        self.assertEqual(total, 1)
        self.assertEqual(rows[0]["id"], "A")
        empty.assert_not_called()

    def test_empty_write_failure_rolls_back_and_honors_strict_mode(self):
        for strict in (False, True):
            for rollback_fails in (False, True):
                conn, cursor = self.make_conn()
                original = psycopg2.OperationalError("empty write")
                if rollback_fails:
                    conn.rollback.side_effect = psycopg2.InterfaceError("rollback")
                with (
                    patch.object(nearby.logger, "exception"),
                    patch.object(nearby, "execute_values", side_effect=original),
                ):
                    if strict:
                        with self.assertRaises(psycopg2.OperationalError) as raised:
                            nearby._refresh_cache(conn, 5, "attraction", "trail", [], strict_cache=True)
                        self.assertIs(raised.exception, original)
                    else:
                        nearby._refresh_cache(conn, 5, "attraction", "trail", [])
                conn.rollback.assert_called_once()
                conn.commit.assert_not_called()

    def test_zero_distance_place_is_not_an_empty_result(self):
        conn, cursor = self.make_conn()
        cursor.fetchall.return_value = [{
            "nearby_content_id": "0", "distance_km": 0, "name": "on route",
            "address": None, "image_url": None, "lat": 37.0, "lng": 127.0,
        }]
        total, rows, _ = nearby.list_nearby_spots(conn, 5, "bicycle")
        self.assertEqual(total, 1)
        self.assertEqual(rows[0]["distance_m"], 0)
        self.assertEqual(rows[0]["id"], "0")

    def test_marker_cannot_match_source_ids(self):
        self.assertGreater(len(nearby._EMPTY_CONTENT_ID), 20)
        self.assertLessEqual(len(nearby._EMPTY_CONTENT_ID), 50)
        self.assertFalse(nearby._EMPTY_CONTENT_ID.isdecimal())


if __name__ == "__main__":
    unittest.main()
