"""로그인 세션 CRUD가 현재 세션만 다루는지 확인한다."""

import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import UUID

from app.crud import user as user_crud


SESSION_ID = UUID("11111111-1111-4111-8111-111111111111")


class TestAuthSessionCrud(unittest.TestCase):
    def setUp(self):
        self.conn = MagicMock()
        self.cursor = self.conn.cursor.return_value.__enter__.return_value

    def test_create_session_cleans_only_expired_sessions_for_user_then_inserts(self):
        expires_at = datetime(2026, 9, 26, tzinfo=timezone.utc)

        user_crud.create_session(self.conn, user_id=7, session_id=SESSION_ID, expires_at=expires_at)

        self.assertEqual(self.cursor.execute.call_count, 2)
        cleanup_query, cleanup_params = self.cursor.execute.call_args_list[0].args
        insert_query, insert_params = self.cursor.execute.call_args_list[1].args
        self.assertIn("user_id = %(user_id)s", cleanup_query)
        self.assertIn("expires_at <= now()", cleanup_query)
        self.assertEqual(cleanup_params, {"user_id": 7})
        self.assertIn("insert into auth_session", insert_query)
        self.assertEqual(
            insert_params,
            {"session_id": str(SESSION_ID), "user_id": 7, "expires_at": expires_at},
        )
        self.conn.commit.assert_called_once()

    def test_authenticated_user_requires_matching_unexpired_session_and_user(self):
        self.cursor.fetchone.return_value = {"id": 7, "nickname": "길손", "kakao_id": 4321}

        result = user_crud.get_authenticated_user(self.conn, user_id=7, session_id=SESSION_ID)

        query, params = self.cursor.execute.call_args.args
        self.assertIn("join app_user", query)
        self.assertIn("s.id = %(session_id)s", query)
        self.assertIn("s.user_id = %(user_id)s", query)
        self.assertIn("s.expires_at > now()", query)
        self.assertEqual(params, {"session_id": str(SESSION_ID), "user_id": 7})
        self.assertEqual(result["id"], 7)

    def test_delete_session_targets_only_current_user_and_session(self):
        user_crud.delete_session(self.conn, user_id=7, session_id=SESSION_ID)

        query, params = self.cursor.execute.call_args.args
        self.assertIn("id = %(session_id)s", query)
        self.assertIn("user_id = %(user_id)s", query)
        self.assertEqual(params, {"session_id": str(SESSION_ID), "user_id": 7})
        self.conn.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
