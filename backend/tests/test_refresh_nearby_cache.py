"""전체 워밍업의 실패 격리와 연결 관리를 실제 DB 없이 검증한다."""
import contextlib
import io
import unittest
from unittest.mock import MagicMock, call, patch

from scripts import refresh_nearby_cache as script


def connection(ids=()):
    conn = MagicMock()
    conn.cursor.return_value.__enter__.return_value.fetchall.return_value = [
        (course_id,) for course_id in ids
    ]
    return conn


class TestWarmAll(unittest.TestCase):
    def run_warm(self, connections, outcomes):
        output = io.StringIO()
        with (
            patch.object(script, "get_db_connection", side_effect=connections) as connect,
            patch.object(script, "warm_course", side_effect=outcomes) as warm,
            patch.object(script, "logger"),
            contextlib.redirect_stdout(output),
        ):
            code = script.warm_all()
        return code, output.getvalue(), connect, warm

    def test_success_reuses_connection(self):
        conn = connection([1, 2])
        code, output, connect, warm = self.run_warm([conn], [None, None])
        self.assertEqual(code, 0)
        self.assertIn("성공 2건, 실패 0건, 미처리 0건", output)
        connect.assert_called_once()
        self.assertEqual(warm.call_args_list, [call(conn, 1), call(conn, 2)])
        conn.close.assert_called_once()

    def test_failure_reconnects_before_next_course(self):
        first, second = connection([1, 2, 3]), connection()
        code, output, connect, warm = self.run_warm(
            [first, second], [None, RuntimeError("partial failure"), None]
        )
        self.assertEqual(code, 1)
        self.assertIn("성공 2건, 실패 1건, 미처리 0건", output)
        self.assertIn("실패 코스 ID: [2]", output)
        self.assertEqual(connect.call_count, 2)
        self.assertEqual(
            warm.call_args_list, [call(first, 1), call(first, 2), call(second, 3)]
        )
        first.close.assert_called_once()
        second.close.assert_called_once()

    def test_reconnect_failure_counts_remaining_as_unprocessed(self):
        for failure in (None, RuntimeError("connect failed")):
            with self.subTest(failure=failure):
                conn = connection([1, 2, 3])
                code, output, _, warm = self.run_warm(
                    [conn, failure], [RuntimeError("query failed")]
                )
                self.assertEqual(code, 1)
                self.assertIn("성공 0건, 실패 1건, 미처리 2건", output)
                self.assertIn("미처리 코스 ID: [2, 3]", output)
                warm.assert_called_once_with(conn, 1)
                conn.close.assert_called_once()

    def test_last_course_failure_does_not_reconnect(self):
        conn = connection([1])
        code, output, connect, _ = self.run_warm([conn], [RuntimeError("failed")])
        self.assertEqual(code, 1)
        self.assertIn("성공 0건, 실패 1건, 미처리 0건", output)
        connect.assert_called_once()
        conn.close.assert_called_once()

    def test_empty_list_and_initial_connection_failure(self):
        conn = connection()
        code, output, _, warm = self.run_warm([conn], [])
        self.assertEqual(code, 0)
        self.assertIn("전체 0건", output)
        warm.assert_not_called()
        conn.close.assert_called_once()
        code, _, _, warm = self.run_warm([None], [])
        self.assertEqual(code, 1)
        warm.assert_not_called()

    def test_list_query_failure_closes_connection(self):
        conn = connection()
        conn.cursor.return_value.__enter__.return_value.execute.side_effect = RuntimeError("SQL")
        code, _, _, warm = self.run_warm([conn], [])
        self.assertEqual(code, 1)
        warm.assert_not_called()
        conn.close.assert_called_once()

    def test_main_preserves_failure_exit_code(self):
        with (
            patch("sys.argv", ["refresh_nearby_cache", "--warm-all"]),
            patch.object(script, "warm_all", return_value=1),
            patch.object(script, "get_db_connection") as connect,
        ):
            self.assertEqual(script.main(), 1)
        connect.assert_not_called()


class TestCacheMaintenance(unittest.TestCase):
    def test_manual_refresh_clears_all_target_rows_before_warming(self):
        conn = connection()
        cursor = conn.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = (1,)
        with patch.object(script, "warm_course") as warm:
            def verify_warm(*args):
                conn.commit.assert_called_once()
            warm.side_effect = verify_warm
            script.refresh_course(conn, 5)
        calls = cursor.execute.call_args_list
        self.assertIn("DELETE FROM nearby_spot", calls[1].args[0])
        self.assertEqual(calls[1].args[1], ("5",))
        self.assertNotIn("nearby_content_id", calls[1].args[0])
        warm.assert_called_once_with(conn, 5)

    def test_cleanup_includes_empty_markers(self):
        conn = connection()
        cursor = conn.cursor.return_value.__enter__.return_value
        cursor.rowcount = 5
        self.assertEqual(script.clean_expired(conn), 5)
        self.assertNotIn("nearby_content_id", cursor.execute.call_args.args[0])
        conn.commit.assert_called_once()


class TestWarmCourseStrictCache(unittest.TestCase):
    def test_warm_course_passes_strict_cache_for_every_combination(self):
        # warm_course()를 모킹하지 않고 실제로 실행해서, 내부에서 list_nearby_spots에
        # strict_cache=True를 실제로 전달하는지 검증한다.
        conn = connection()
        with patch.object(script, "list_nearby_spots", return_value=(0, [], "v")) as list_spots:
            script.warm_course(conn, 5)

        expected_calls = len(script._ROUTE_TYPES) * len(script._CATEGORIES)
        self.assertEqual(list_spots.call_count, expected_calls)
        for call_args in list_spots.call_args_list:
            self.assertTrue(call_args.kwargs.get("strict_cache"))

            
if __name__ == "__main__":
    unittest.main()
