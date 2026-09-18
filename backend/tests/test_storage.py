"""R2 저장소(services/storage.py) 테스트 (unittest, 네트워크 없이).

사전 서명 URL은 서명만 계산하므로 R2에 접속하지 않는다. 나머지 요청은 botocore Stubber로 응답을 흉내 낸다.

실행 (backend/ 에서):
    python -m unittest tests.test_storage
"""
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from botocore.stub import Stubber

from app.core.config import settings
from app.services import storage
from app.services.storage import Folder

R2_SETTINGS = {
    "r2_account_id": "acc123",
    "r2_access_key_id": "test-access-key",
    "r2_secret_access_key": "test-secret-key",
    "r2_bucket": "test-uploads",
}


class StorageTestCase(unittest.TestCase):
    def setUp(self):
        self.settings_patch = patch.multiple(settings, **R2_SETTINGS)
        self.settings_patch.start()
        storage._client.cache_clear()
        self.stubber = Stubber(storage._client())
        self.stubber.activate()

    def tearDown(self):
        self.stubber.deactivate()
        storage._client.cache_clear()
        self.settings_patch.stop()


class ConfigTest(unittest.TestCase):
    def test_is_configured_needs_every_value(self):
        with patch.multiple(settings, **R2_SETTINGS):
            self.assertTrue(storage.is_configured())
            for name in R2_SETTINGS:
                with patch.object(settings, name, ""):
                    self.assertFalse(storage.is_configured(), name)


class NewKeyTest(unittest.TestCase):
    def test_key_starts_with_folder_and_user_id_and_uses_type_extension(self):
        self.assertRegex(storage.new_key(Folder.AVATAR, 7, "image/webp"), r"^avatars/7/[0-9a-f]{32}\.webp$")
        self.assertRegex(
            storage.new_key(Folder.RECORD_CARD, 7, "image/jpeg"), r"^record-cards/7/[0-9a-f]{32}\.jpg$"
        )

    def test_keys_are_unique(self):
        self.assertNotEqual(storage.new_key(Folder.AVATAR, 7, "image/jpeg"), storage.new_key(Folder.AVATAR, 7, "image/jpeg"))

    def test_rejects_other_types(self):
        for content_type in ("image/svg+xml", "image/gif", "text/html", ""):
            with self.assertRaises(ValueError, msg=content_type):
                storage.new_key(Folder.AVATAR, 7, content_type)


class PresignTest(StorageTestCase):
    def test_upload_url_signs_content_type_and_expires_quickly(self):
        url = urlparse(storage.presign_upload("avatars/7/a.webp", "image/webp"))
        query = parse_qs(url.query)

        self.assertEqual(url.netloc, "acc123.r2.cloudflarestorage.com")
        self.assertEqual(url.path, "/test-uploads/avatars/7/a.webp")
        self.assertEqual(query["X-Amz-Expires"], [str(storage.UPLOAD_URL_EXPIRES_SECONDS)])
        # 서명에 Content-Type이 들어가야 다른 형식으로 바꿔 올릴 수 없다.
        self.assertIn("content-type", query["X-Amz-SignedHeaders"][0])

    def test_download_url(self):
        url = urlparse(storage.presign_download("record-cards/7/b.jpg"))
        query = parse_qs(url.query)

        self.assertEqual(url.path, "/test-uploads/record-cards/7/b.jpg")
        self.assertEqual(query["X-Amz-Expires"], [str(storage.DOWNLOAD_URL_EXPIRES_SECONDS)])

    def test_urls_do_not_contain_secret_key(self):
        url = storage.presign_download("avatars/7/a.webp")
        self.assertNotIn("test-secret-key", url)


class HeadTest(StorageTestCase):
    def test_returns_size_and_type(self):
        self.stubber.add_response(
            "head_object",
            {"ContentLength": 1234, "ContentType": "image/webp"},
            {"Bucket": "test-uploads", "Key": "avatars/7/a.webp"},
        )
        self.assertEqual(
            storage.head("avatars/7/a.webp"),
            storage.ObjectInfo(size=1234, content_type="image/webp"),
        )

    def test_missing_object_is_none(self):
        self.stubber.add_client_error("head_object", service_error_code="404", http_status_code=404)
        self.assertIsNone(storage.head("avatars/7/none.webp"))

    def test_other_errors_raise_storage_error(self):
        self.stubber.add_client_error("head_object", service_error_code="403", http_status_code=403)
        with self.assertRaises(storage.StorageError):
            storage.head("avatars/7/a.webp")


class DeleteTest(StorageTestCase):
    def test_delete_one(self):
        self.stubber.add_response("delete_object", {}, {"Bucket": "test-uploads", "Key": "avatars/7/a.webp"})
        storage.delete("avatars/7/a.webp")
        self.stubber.assert_no_pending_responses()

    def test_delete_error_raises_storage_error(self):
        self.stubber.add_client_error("delete_object", service_error_code="AccessDenied", http_status_code=403)
        with self.assertRaises(storage.StorageError):
            storage.delete("avatars/7/a.webp")

    def test_delete_user_objects_clears_every_folder_by_prefix(self):
        self.stubber.add_response(
            "list_objects_v2",
            {"Contents": [{"Key": "avatars/7/a.webp"}], "IsTruncated": False},
            {"Bucket": "test-uploads", "Prefix": "avatars/7/"},
        )
        self.stubber.add_response(
            "delete_objects",
            {},
            {"Bucket": "test-uploads", "Delete": {"Objects": [{"Key": "avatars/7/a.webp"}], "Quiet": True}},
        )
        # 기록 카드가 없으면 삭제 요청을 보내지 않는다.
        self.stubber.add_response(
            "list_objects_v2", {"IsTruncated": False}, {"Bucket": "test-uploads", "Prefix": "record-cards/7/"}
        )

        storage.delete_user_objects(7)
        self.stubber.assert_no_pending_responses()

    def test_delete_user_objects_reports_partial_failure(self):
        self.stubber.add_response(
            "list_objects_v2", {"Contents": [{"Key": "avatars/7/a.webp"}], "IsTruncated": False}
        )
        self.stubber.add_response(
            "delete_objects", {"Errors": [{"Key": "avatars/7/a.webp", "Code": "InternalError"}]}
        )
        with self.assertRaises(storage.StorageError):
            storage.delete_user_objects(7)


if __name__ == "__main__":
    unittest.main()
