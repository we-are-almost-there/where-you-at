"""record.py의 crud 함수 테스트 (unittest, DB 없이 cursor를 mock으로 바꾼다)."""
import unittest
from unittest.mock import MagicMock

from app.crud.record import list_cards


def make_conn(*, total: int, rows=None):
    cur = MagicMock()
    cur.fetchone.return_value = {"n": total}
    cur.fetchall.return_value = rows or []
    conn = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    return conn, cur


class ListCardsCrudTest(unittest.TestCase):
    def test_offset_beyond_total_skips_join_query(self):
        conn, cur = make_conn(total=5)
        total, rows = list_cards(conn, user_id=7, page=999999, size=12)
        self.assertEqual(total, 5)
        self.assertEqual(rows, [])
        # count 쿼리만 나가고, offset이 total을 넘으면 join 쿼리는 안 나간다.
        self.assertEqual(cur.execute.call_count, 1)

    def test_empty_result_skips_join_query(self):
        conn, cur = make_conn(total=0)
        total, rows = list_cards(conn, user_id=7, page=1, size=12)
        self.assertEqual((total, rows), (0, []))
        self.assertEqual(cur.execute.call_count, 1)

    def test_offset_within_total_runs_join_query(self):
        row = {"card_id": 1}
        conn, cur = make_conn(total=5, rows=[row])
        total, rows = list_cards(conn, user_id=7, page=1, size=12)
        self.assertEqual(total, 5)
        self.assertEqual(rows, [row])
        self.assertEqual(cur.execute.call_count, 2)
        params = cur.execute.call_args.args[1]
        self.assertEqual((params["user_id"], params["size"], params["offset"]), (7, 12, 0))


if __name__ == "__main__":
    unittest.main()
