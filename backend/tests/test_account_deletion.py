"""공통 계정 삭제 서비스가 R2를 먼저 정리하고 실패 시 회원을 보존하는지 확인한다."""

import unittest
from unittest.mock import MagicMock, call, patch

from app.services import account_deletion, storage


class AccountDeletionTest(unittest.TestCase):
    def setUp(self):
        self.conn = MagicMock()
        db_patcher = patch("app.services.account_deletion.db_connection")
        self.db_connection = db_patcher.start()
        self.db_connection.return_value.__enter__.return_value = self.conn
        self.addCleanup(db_patcher.stop)

        configured_patcher = patch("app.services.account_deletion.storage.is_configured", return_value=True)
        self.configured = configured_patcher.start()
        self.addCleanup(configured_patcher.stop)

        cleanup_patcher = patch("app.services.account_deletion.storage.delete_user_objects")
        self.cleanup = cleanup_patcher.start()
        self.addCleanup(cleanup_patcher.stop)

        delete_patcher = patch("app.services.account_deletion.user_crud.delete_user")
        self.delete_user = delete_patcher.start()
        self.addCleanup(delete_patcher.stop)

        lock_patcher = patch(
            "app.services.account_deletion.user_crud.lock_user_for_update",
            return_value={"id": 7, "avatar_key": "avatars/7/old.webp"},
        )
        self.lock_user = lock_patcher.start()
        self.addCleanup(lock_patcher.stop)

    def test_deletes_r2_objects_before_database_user(self):
        calls = []
        self.lock_user.side_effect = lambda conn, user_id: calls.append(call.lock(conn, user_id)) or {"id": user_id}
        self.cleanup.side_effect = lambda user_id: calls.append(call.r2(user_id))
        self.delete_user.side_effect = lambda conn, user_id: calls.append(call.db(conn, user_id))

        account_deletion.delete_account(7)

        self.assertEqual(calls, [call.lock(self.conn, 7), call.r2(7), call.db(self.conn, 7)])

    def test_r2_failure_keeps_database_user_for_retry(self):
        self.cleanup.side_effect = storage.StorageError("boom")

        with self.assertRaises(account_deletion.ObjectCleanupError):
            account_deletion.delete_account(7)

        self.db_connection.assert_called_once()
        self.conn.rollback.assert_called_once()
        self.delete_user.assert_not_called()

    def test_missing_r2_configuration_keeps_database_user(self):
        self.configured.return_value = False

        with self.assertRaises(account_deletion.ObjectCleanupError):
            account_deletion.delete_account(7)

        self.cleanup.assert_not_called()
        self.db_connection.assert_not_called()
        self.delete_user.assert_not_called()

    def test_missing_user_skips_r2_and_database_delete(self):
        self.lock_user.return_value = None

        account_deletion.delete_account(7)

        self.cleanup.assert_not_called()
        self.delete_user.assert_not_called()
        self.conn.rollback.assert_called_once()


if __name__ == "__main__":
    unittest.main()
