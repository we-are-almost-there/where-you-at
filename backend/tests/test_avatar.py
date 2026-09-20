"""프로필 사진 업로드 API 테스트. R2와 DB는 모두 mock으로 대체한다."""

import unittest
from unittest.mock import MagicMock, patch
from uuid import UUID

from fastapi.testclient import TestClient

from app.api.routers.me import AVATAR_MAX_BYTES
from app.core.config import settings
from app.main import app
from app.services import auth_token, storage

SECRET = "s" * 32
SESSION_ID = UUID("11111111-1111-4111-8111-111111111111")
USER = {"id": 7, "nickname": "길손", "bio": None, "avatar_key": None, "kakao_id": 4321}
UPLOAD_KEY = "uploads/7/" + "a" * 32 + ".webp"
AVATAR_KEY = "avatars/7/" + "a" * 32 + ".webp"


def _headers():
    return {"Authorization": f"Bearer {auth_token.create_access_token(7, SESSION_ID)}"}


class AvatarApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        secret = patch.object(settings, "jwt_secret", SECRET)
        secret.start()
        self.addCleanup(secret.stop)
        connect = patch("app.deps.get_db_connection", return_value=MagicMock())
        connect.start()
        self.addCleanup(connect.stop)
        auth = patch("app.crud.user.get_authenticated_user", return_value=USER)
        auth.start()
        self.addCleanup(auth.stop)

    @patch("app.services.storage.presign_upload", return_value="https://upload.example/signed")
    @patch("app.services.storage.new_key", return_value=UPLOAD_KEY)
    @patch("app.services.storage.is_configured", return_value=True)
    def test_creates_upload_ticket_for_supported_image(self, _configured, mock_new_key, mock_presign):
        res = self.client.post(
            "/api/me/avatar/upload-url",
            headers=_headers(),
            json={"content_type": "image/webp"},
        )

        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            res.json(),
            {"upload_url": "https://upload.example/signed", "upload_key": UPLOAD_KEY, "max_bytes": AVATAR_MAX_BYTES},
        )
        mock_new_key.assert_called_once_with(storage.Folder.UPLOAD, 7, "image/webp")
        mock_presign.assert_called_once_with(UPLOAD_KEY, "image/webp")

    def test_rejects_unsupported_type_before_r2(self):
        with patch("app.services.storage.is_configured") as configured:
            res = self.client.post(
                "/api/me/avatar/upload-url",
                headers=_headers(),
                json={"content_type": "image/gif"},
            )

        self.assertEqual(res.status_code, 422)
        configured.assert_not_called()

    @patch("app.crud.user.set_avatar")
    @patch("app.services.storage.delete")
    @patch("app.services.storage.presign_download", return_value="https://view.example/signed")
    @patch("app.services.storage.promote", return_value=AVATAR_KEY)
    @patch(
        "app.services.storage.head",
        return_value=storage.ObjectInfo(size=1234, content_type="image/webp", etag='"etag"'),
    )
    @patch("app.services.storage.is_configured", return_value=True)
    def test_completes_upload_and_deletes_previous_avatar(
        self, _configured, mock_head, mock_promote, _presign, mock_delete, mock_set_avatar
    ):
        mock_set_avatar.return_value = (
            {"id": 7, "nickname": "길손", "bio": None, "avatar_key": AVATAR_KEY},
            "avatars/7/old.webp",
        )

        res = self.client.post(
            "/api/me/avatar/complete",
            headers=_headers(),
            json={"upload_key": UPLOAD_KEY},
        )

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["avatar_url"], "https://view.example/signed")
        mock_head.assert_called_once_with(UPLOAD_KEY)
        mock_promote.assert_called_once()
        self.assertEqual(mock_set_avatar.call_args.args[1:], (7, AVATAR_KEY))
        mock_delete.assert_called_once_with("avatars/7/old.webp")

    @patch("app.services.storage.head")
    @patch("app.services.storage.is_configured", return_value=True)
    def test_rejects_another_users_upload_key_without_reading_it(self, _configured, mock_head):
        other_key = "uploads/8/" + "a" * 32 + ".webp"

        res = self.client.post(
            "/api/me/avatar/complete",
            headers=_headers(),
            json={"upload_key": other_key},
        )

        self.assertEqual(res.status_code, 400)
        mock_head.assert_not_called()

    @patch("app.services.storage.delete")
    @patch(
        "app.services.storage.head",
        return_value=storage.ObjectInfo(size=AVATAR_MAX_BYTES + 1, content_type="image/webp", etag='"etag"'),
    )
    @patch("app.services.storage.is_configured", return_value=True)
    def test_rejects_and_discards_too_large_upload(self, _configured, _head, mock_delete):
        res = self.client.post(
            "/api/me/avatar/complete",
            headers=_headers(),
            json={"upload_key": UPLOAD_KEY},
        )

        self.assertEqual(res.status_code, 413)
        mock_delete.assert_called_once_with(UPLOAD_KEY)

    @patch("app.services.storage.is_configured", return_value=False)
    def test_storage_configuration_is_required(self, _configured):
        res = self.client.post(
            "/api/me/avatar/upload-url",
            headers=_headers(),
            json={"content_type": "image/png"},
        )

        self.assertEqual(res.status_code, 503)

    @patch("app.services.storage.delete")
    @patch("app.services.storage.is_configured", return_value=True)
    @patch("app.crud.user.set_avatar")
    def test_deletes_current_avatar_and_returns_default_profile(self, mock_set_avatar, _configured, mock_delete):
        mock_set_avatar.return_value = (
            {"id": 7, "nickname": "길손", "bio": None, "avatar_key": None},
            "avatars/7/old.webp",
        )

        res = self.client.delete("/api/me/avatar", headers=_headers())

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"id": 7, "nickname": "길손", "bio": None})
        self.assertEqual(mock_set_avatar.call_args.args[1:], (7, None))
        mock_delete.assert_called_once_with("avatars/7/old.webp")


if __name__ == "__main__":
    unittest.main()
