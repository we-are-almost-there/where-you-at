"""crud.saved_course 테스트 (unittest, DB 없이 커서를 흉내 낸다).

추가와 삭제가 멱등인지, 외래키 위반을 "없는 코스"와 "탈퇴한 회원"으로 나누는지 확인한다.

실행 (backend/ 에서):
    python -m unittest tests.test_saved_course_crud
"""
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from psycopg2 import errors

from app.crud import saved_course as crud


def _conn(rows=None):
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = rows or []
    return conn, cursor


class _FakeForeignKeyViolation(errors.ForeignKeyViolation):
    """diag를 원하는 제약 이름으로 채운 외래키 위반. 실제 diag는 psycopg2가 DB 응답으로만 채운다."""

    def __init__(self, constraint_name):
        super().__init__()
        self._diag = SimpleNamespace(constraint_name=constraint_name)

    @property
    def diag(self):
        return self._diag


def _fk_violation(constraint_name):
    return _FakeForeignKeyViolation(constraint_name)


class TestAdd(unittest.TestCase):
    def test_insert_ignores_duplicate(self):
        conn, cursor = _conn()

        crud.add(conn, user_id=7, course_id=12, route_type="bicycle")

        query, params = cursor.execute.call_args.args
        self.assertIn("insert into saved_course", query)
        self.assertIn("on conflict do nothing", query)
        self.assertEqual(params, {"user_id": 7, "course_id": 12, "route_type": "bicycle"})
        conn.commit.assert_called_once()

    def test_unknown_course_or_route_raises_unknown_route(self):
        conn, cursor = _conn()
        cursor.execute.side_effect = _fk_violation("saved_course_route_fk")

        with self.assertRaises(crud.UnknownRouteError):
            crud.add(conn, user_id=7, course_id=999, route_type="bicycle")
        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()

    def test_withdrawn_user_raises_unknown_user(self):
        conn, cursor = _conn()
        cursor.execute.side_effect = _fk_violation("saved_course_user_fk")

        with self.assertRaises(crud.UnknownUserError):
            crud.add(conn, user_id=7, course_id=12, route_type="trail")
        conn.rollback.assert_called_once()


class TestRemove(unittest.TestCase):
    def test_deletes_one_route_type(self):
        conn, cursor = _conn()

        crud.remove(conn, user_id=7, course_id=12, route_type="trail")

        query, params = cursor.execute.call_args.args
        self.assertIn("delete from saved_course", query)
        self.assertIn("route_type = %(route_type)s", query)
        self.assertEqual(params, {"user_id": 7, "course_id": 12, "route_type": "trail"})
        conn.commit.assert_called_once()


class TestList(unittest.TestCase):
    def test_list_saved_orders_by_saved_at_desc_and_fills_card_fields(self):
        rows = [{"id": 12, "route_type": "bicycle"}, {"id": 3, "route_type": "trail"}]
        conn, cursor = _conn(rows)

        with patch("app.crud.course.attach_card_fields") as attach:
            result = crud.list_saved(conn, 7)

        query, params = cursor.execute.call_args.args
        self.assertIn("ORDER BY s.created_at DESC", query)
        self.assertEqual(params, {"user_id": 7})
        attach.assert_called_once_with(conn, rows)
        self.assertEqual(result, rows)

    def test_list_keys_reads_only_key_columns(self):
        conn, cursor = _conn([{"course_id": 12, "route_type": "bicycle"}])

        result = crud.list_keys(conn, 7)

        query, params = cursor.execute.call_args.args
        self.assertIn("select course_id, route_type from saved_course", query)
        self.assertEqual(params, {"user_id": 7})
        self.assertEqual(result, [{"course_id": 12, "route_type": "bicycle"}])


if __name__ == "__main__":
    unittest.main()
