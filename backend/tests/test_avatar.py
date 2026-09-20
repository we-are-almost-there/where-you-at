"""프로필 사진 업로드 API 테스트. R2와 DB는 모두 mock으로 대체한다."""

import asyncio
import unittest
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

from fastapi import HTTPException, Request
from fastapi.testclient import TestClient
from PIL import Image

from app.api.routers import me
from app.api.routers.me import AVATAR_MAX_BYTES
from app.core.config import settings
from app.main import app
from app.services import auth_token

SECRET = "s" * 32
SESSION_ID = UUID("11111111-1111-4111-8111-111111111111")
USER = {"id": 7, "nickname": "길손", "bio": None, "avatar_key": None, "kakao_id": 4321}
AVATAR_KEY = "avatars/7/" + "a" * 32 + ".webp"


def _image_bytes(format_name: str, size: tuple[int, int] = (512, 512)) -> bytes:
    output = BytesIO()
    Image.new("RGB", size, "purple").save(output, format=format_name)
    return output.getvalue()


WEBP = _image_bytes("WEBP")
PNG = _image_bytes("PNG")


def _headers(content_type: str | None = None):
    headers = {"Authorization": f"Bearer {auth_token.create_access_token(7, SESSION_ID)}"}
    if content_type:
        headers["Content-Type"] = content_type
    return headers


class AvatarApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        me.avatar_upload_limiter.reset()
        secret = patch.object(settings, "jwt_secret", SECRET)
        secret.start()
        self.addCleanup(secret.stop)
        connect = patch("app.deps.get_db_connection", return_value=MagicMock())
        connect.start()
        self.addCleanup(connect.stop)
        auth = patch("app.crud.user.get_authenticated_user", return_value=USER)
        auth.start()
        self.addCleanup(auth.stop)

    @patch("app.crud.user.set_avatar_locked")
    @patch("app.crud.user.lock_user_for_update", return_value={"id": 7, "avatar_key": "avatars/7/old.webp"})
    @patch("app.services.storage.delete")
    @patch("app.services.storage.presign_download", return_value="https://view.example/signed")
    @patch("app.services.storage.put")
    @patch("app.services.storage.new_key", return_value=AVATAR_KEY)
    @patch("app.services.storage.is_configured", return_value=True)
    def test_validates_and_uploads_image_then_deletes_previous_avatar(
        self, _configured, mock_new_key, mock_put, _presign, mock_delete, mock_lock, mock_set_avatar
    ):
        calls = []
        mock_put.side_effect = lambda *args: calls.append("r2")
        mock_lock.side_effect = lambda *args: calls.append("lock") or {
            "id": 7,
            "avatar_key": "avatars/7/old.webp",
        }
        mock_set_avatar.return_value = {"id": 7, "nickname": "길손", "bio": None, "avatar_key": AVATAR_KEY}

        res = self.client.put("/api/me/avatar", headers=_headers("image/webp"), content=WEBP)

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["avatar_url"], "https://view.example/signed")
        mock_new_key.assert_called_once_with(me.storage.Folder.AVATAR, 7, "image/webp")
        mock_lock.assert_called_once()
        mock_put.assert_called_once_with(AVATAR_KEY, WEBP, "image/webp")
        self.assertEqual(calls, ["r2", "lock"])
        self.assertEqual(mock_set_avatar.call_args.args[1:], (7, AVATAR_KEY))
        mock_delete.assert_called_once_with("avatars/7/old.webp")

    @patch("app.crud.user.set_avatar_locked")
    @patch("app.crud.user.lock_user_for_update", return_value=None)
    @patch("app.services.storage.delete")
    @patch("app.services.storage.put")
    @patch("app.services.storage.new_key", return_value=AVATAR_KEY)
    def test_deletes_new_r2_object_when_account_deletion_finishes_first(
        self, _new_key, mock_put, mock_delete, _lock, mock_set_avatar
    ):
        with self.assertRaises(HTTPException) as ctx:
            me._store_avatar(7, WEBP, "image/webp")

        self.assertEqual(ctx.exception.status_code, 401)
        mock_put.assert_called_once_with(AVATAR_KEY, WEBP, "image/webp")
        mock_delete.assert_called_once_with(AVATAR_KEY)
        mock_set_avatar.assert_not_called()

    def test_opens_database_only_after_r2_put_finishes(self):
        conn = MagicMock()
        db_context = MagicMock()
        db_context.__enter__.return_value = conn
        user = {"id": 7, "nickname": "길손", "bio": None, "avatar_key": AVATAR_KEY}

        with (
            patch("app.api.routers.me.db_connection", return_value=db_context) as mock_db,
            patch("app.services.storage.new_key", return_value=AVATAR_KEY),
            patch("app.services.storage.put") as mock_put,
            patch("app.crud.user.lock_user_for_update", return_value={"id": 7, "avatar_key": None}),
            patch("app.crud.user.set_avatar_locked", return_value=user),
            patch("app.api.routers.me.profile.user_out", return_value=user),
        ):
            mock_put.side_effect = lambda *args: mock_db.assert_not_called()

            self.assertEqual(me._store_avatar(7, WEBP, "image/webp"), user)

        mock_put.assert_called_once_with(AVATAR_KEY, WEBP, "image/webp")
        mock_db.assert_called_once_with()

    @patch("app.api.routers.me.run_in_threadpool", new_callable=AsyncMock)
    @patch("app.services.storage.is_configured", return_value=True)
    def test_offloads_decode_r2_and_db_work_from_event_loop(self, _configured, mock_threadpool):
        mock_threadpool.return_value = {"id": 7, "nickname": "길손", "bio": None}

        res = self.client.put("/api/me/avatar", headers=_headers("image/webp"), content=WEBP)

        self.assertEqual(res.status_code, 200)
        mock_threadpool.assert_awaited_once_with(me._store_avatar, 7, WEBP, "image/webp")

    def test_stream_limit_does_not_depend_on_content_length_header(self):
        chunks = iter((bytes(AVATAR_MAX_BYTES), b"x"))

        async def receive():
            chunk = next(chunks)
            return {"type": "http.request", "body": chunk, "more_body": len(chunk) == AVATAR_MAX_BYTES}

        request = Request({"type": "http", "method": "PUT", "path": "/", "headers": []}, receive)

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(me._avatar_body(request))
        self.assertEqual(ctx.exception.status_code, 413)

    @patch("app.services.storage.put")
    @patch("app.services.storage.is_configured", return_value=True)
    def test_rejects_forged_content_type_before_r2(self, _configured, mock_put):
        res = self.client.put(
            "/api/me/avatar",
            headers=_headers("image/webp"),
            content=b"RIFF\x10\x00\x00\x00WEBPVP8 " + b"not an image",
        )

        self.assertEqual(res.status_code, 400)
        mock_put.assert_not_called()

    @patch("app.services.storage.put")
    @patch("app.services.storage.is_configured", return_value=True)
    def test_rejects_declared_type_that_differs_from_magic_bytes(self, _configured, mock_put):
        res = self.client.put(
            "/api/me/avatar",
            headers=_headers("image/webp"),
            content=PNG,
        )

        self.assertEqual(res.status_code, 400)
        mock_put.assert_not_called()

    @patch("app.services.storage.put")
    @patch("app.services.storage.is_configured", return_value=True)
    def test_rejects_too_large_body_before_r2(self, _configured, mock_put):
        res = self.client.put(
            "/api/me/avatar",
            headers=_headers("image/jpeg"),
            content=b"\xff\xd8\xff" + bytes(AVATAR_MAX_BYTES - 2),
        )

        self.assertEqual(res.status_code, 413)
        mock_put.assert_not_called()

    @patch("app.services.storage.put")
    @patch("app.services.storage.is_configured", return_value=True)
    def test_rejects_unsupported_type_before_r2(self, _configured, mock_put):
        res = self.client.put("/api/me/avatar", headers=_headers("image/gif"), content=b"GIF89a")

        self.assertEqual(res.status_code, 400)
        mock_put.assert_not_called()

    @patch("app.api.routers.me.avatar_upload_limiter.allow", return_value=False)
    @patch("app.services.storage.put")
    def test_rate_limits_upload_writes(self, mock_put, _allow):
        res = self.client.put("/api/me/avatar", headers=_headers("image/webp"), content=WEBP)

        self.assertEqual(res.status_code, 429)
        self.assertEqual(res.headers["Retry-After"], "60")
        mock_put.assert_not_called()

    @patch("app.services.storage.is_configured", return_value=False)
    def test_storage_configuration_is_required(self, _configured):
        res = self.client.put("/api/me/avatar", headers=_headers("image/png"), content=b"\x89PNG\r\n\x1a\n")

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
