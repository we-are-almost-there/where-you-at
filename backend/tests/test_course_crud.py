"""app/crud/course.py list_courses 정렬 단위테스트.

정렬 값이 같은 코스끼리 페이지 요청 사이에 순서가 바뀌면 중복 노출이나 누락이
생기므로, ORDER BY에 c.id 보조 정렬이 붙는지 DB 없이 목 커넥션으로 검증한다.

실행: backend/ 에서  python -m unittest discover -s tests
"""
import re
import unittest
from unittest.mock import MagicMock

from app.crud.course import list_courses


def _mock_conn():
    """count 쿼리에는 total 0, 목록 쿼리에는 빈 행을 돌려주는 목 커넥션.
    행이 비어 있으면 경로, 좌표, 관광지 보조 쿼리는 실행되지 않는다."""
    conn = MagicMock()
    cursor = MagicMock()
    cursor.fetchone.return_value = {"total": 0}
    cursor.fetchall.return_value = []
    conn.cursor.return_value.__enter__.return_value = cursor
    return conn, cursor


def _list_sql_params(cursor):
    # 0번 호출은 count 쿼리, 1번 호출이 ORDER BY가 있는 목록 쿼리
    sql, params = cursor.execute.call_args_list[1].args
    return sql, params


def _order_by(sql):
    """ORDER BY와 LIMIT 사이의 정렬 절만 꺼낸다."""
    return re.search(r"ORDER BY\s+(.*?)\s+LIMIT", sql, re.DOTALL).group(1)


# ── list_courses 정렬 ────────────────────────────────────────────────────


class TestListCoursesSortTiebreaker(unittest.TestCase):
    def test_column_sorts_append_id_tiebreaker(self):
        cases = {
            "distance_asc": "cr.distance ASC, c.id",
            "distance_desc": "cr.distance DESC, c.id",
            "time_asc": "cr.estimated_time ASC, c.id",
            "time_desc": "cr.estimated_time DESC, c.id",
        }
        for sort, expected in cases.items():
            with self.subTest(sort=sort):
                conn, cursor = _mock_conn()
                list_courses(conn, sort=sort)
                sql, _ = _list_sql_params(cursor)
                self.assertEqual(_order_by(sql), expected)

    def test_default_sort_has_single_id(self):
        cases = {
            "sort 없음": {},
            "모르는 sort": {"sort": "unknown"},
            # 이용자 위치를 서버로 받지 않으므로 '가까운 순'은 브라우저가 정렬한다. 서버는 기본 정렬이다.
            "nearest": {"sort": "nearest"},
        }
        for label, kwargs in cases.items():
            with self.subTest(label):
                conn, cursor = _mock_conn()
                list_courses(conn, **kwargs)
                sql, _ = _list_sql_params(cursor)
                self.assertEqual(_order_by(sql), "c.id")


if __name__ == "__main__":
    unittest.main()
