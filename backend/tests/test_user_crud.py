"""crud.user.update_profile 테스트 (unittest, DB 없이 커서를 흉내 낸다).

보낸 칸만 SET에 들어가고, 값은 매개변수로 넘어가며, 허용하지 않은 칸 이름은 SQL에 들어가지 않는지 확인한다.

실행 (backend/ 에서):
    python -m unittest tests.test_user_crud
"""
import unittest
from unittest.mock import MagicMock

from app.crud import user as user_crud


def _conn(row):
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = row
    return conn, cursor


class TestUpdateProfile(unittest.TestCase):
    def test_sets_only_given_fields(self):
        conn, cursor = _conn({"id": 7, "nickname": "길손", "bio": "안녕하세요"})

        row = user_crud.update_profile(conn, 7, {"bio": "안녕하세요"})

        query, params = cursor.execute.call_args.args
        self.assertIn("set bio = %(bio)s", query)
        self.assertNotIn("nickname =", query)
        self.assertEqual(params, {"id": 7, "bio": "안녕하세요"})
        self.assertEqual(row["bio"], "안녕하세요")
        conn.commit.assert_called_once()

    def test_sets_both_fields(self):
        conn, cursor = _conn({"id": 7, "nickname": "새 이름", "bio": None})

        user_crud.update_profile(conn, 7, {"nickname": "새 이름", "bio": None})

        query, params = cursor.execute.call_args.args
        self.assertIn("nickname = %(nickname)s, bio = %(bio)s", query)
        self.assertEqual(params, {"id": 7, "nickname": "새 이름", "bio": None})

    def test_ignores_unknown_field_names(self):
        conn, cursor = _conn({"id": 7, "nickname": "길손", "bio": None})

        user_crud.update_profile(conn, 7, {"nickname": "길손", "kakao_id": 1})

        query, params = cursor.execute.call_args.args
        self.assertNotIn("kakao_id", query)
        self.assertNotIn("kakao_id", params)

    def test_no_field_raises(self):
        conn, cursor = _conn(None)

        with self.assertRaises(ValueError):
            user_crud.update_profile(conn, 7, {})
        cursor.execute.assert_not_called()

    def test_missing_user_returns_none(self):
        conn, _ = _conn(None)

        self.assertIsNone(user_crud.update_profile(conn, 7, {"bio": None}))


if __name__ == "__main__":
    unittest.main()
