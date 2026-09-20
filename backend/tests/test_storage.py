"""R2 저장소(services/storage.py) 테스트 (unittest, 네트워크 없이).

사전 서명 URL은 서명만 계산하므로 R2에 접속하지 않는다. 나머지 요청은 botocore Stubber로 응답을 흉내 낸다.

실행 (backend/ 에서):
    python -m unittest tests.test_storage
"""
import unittest
from io import BytesIO
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from botocore.stub import Stubber
from PIL import Image

from app.core.config import settings
from app.services import storage
from app.services.storage import Folder
from scripts import check_r2

R2_SETTINGS = {
    "r2_account_id": "acc123",
    "r2_access_key_id": "test-access-key",
    "r2_secret_access_key": "test-secret-key",
    "r2_bucket": "test-uploads",
}


def _image_bytes(format_name: str) -> bytes:
    output = BytesIO()
    Image.new("RGB", (2, 2), "purple").save(output, format=format_name)
    return output.getvalue()


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


class DecodedImageContentTypeTest(unittest.TestCase):
    def test_decodes_supported_images(self):
        self.assertEqual(storage.decoded_image_content_type(_image_bytes("JPEG")), "image/jpeg")
        self.assertEqual(storage.decoded_image_content_type(_image_bytes("PNG")), "image/png")
        self.assertEqual(storage.decoded_image_content_type(_image_bytes("WEBP")), "image/webp")

    def test_rejects_arbitrary_signature_only_and_truncated_files(self):
        files = (
            b"",
            b"<script>bad</script>",
            b"\xff\xd8\xffnot a jpeg",
            b"\x89PNG\r\n\x1a\nnot a png",
            b"RIFF\x10\x00\x00\x00WEBPVP8 not a webp",
            _image_bytes("PNG")[:20],
        )
        for data in files:
            self.assertIsNone(storage.decoded_image_content_type(data), data[:20])


class CheckR2Test(unittest.TestCase):
    def test_only_explicit_access_denials_count_as_blocked_public_access(self):
        for status in (400, 401, 403, 404):
            self.assertIn(status, check_r2._BLOCKED_PUBLIC_STATUSES)

        # 리다이렉트, rate limit, 서버 오류는 비공개라는 증거가 아니다.
        for status in (200, 301, 302, 429, 500, 503):
            self.assertNotIn(status, check_r2._BLOCKED_PUBLIC_STATUSES)


class PresignTest(StorageTestCase):
    def test_upload_url_signs_content_type_and_expires_quickly(self):
        url = urlparse(storage.presign_upload("uploads/7/a.webp", "image/webp"))
        query = parse_qs(url.query)

        self.assertEqual(url.netloc, "acc123.r2.cloudflarestorage.com")
        self.assertEqual(url.path, "/test-uploads/uploads/7/a.webp")
        self.assertEqual(query["X-Amz-Expires"], [str(storage.UPLOAD_URL_EXPIRES_SECONDS)])
        # 서명에 Content-Type이 들어가야 다른 형식으로 바꿔 올릴 수 없다.
        self.assertIn("content-type", query["X-Amz-SignedHeaders"][0])

    def test_upload_url_only_for_temporary_keys(self):
        # 최종 키에 업로드 URL을 주면 검증한 뒤에도 덮어쓸 수 있다.
        for key in ("avatars/7/a.webp", "record-cards/7/b.jpg", "uploadsx/7/a.webp"):
            with self.assertRaises(ValueError, msg=key):
                storage.presign_upload(key, "image/webp")

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
            {"ContentLength": 1234, "ContentType": "image/webp", "ETag": '"abc"'},
            {"Bucket": "test-uploads", "Key": "avatars/7/a.webp"},
        )
        self.assertEqual(
            storage.head("avatars/7/a.webp"),
            storage.ObjectInfo(size=1234, content_type="image/webp", etag='"abc"'),
        )

    def test_missing_object_is_none(self):
        self.stubber.add_client_error("head_object", service_error_code="404", http_status_code=404)
        self.assertIsNone(storage.head("avatars/7/none.webp"))

    def test_other_errors_raise_storage_error(self):
        self.stubber.add_client_error("head_object", service_error_code="403", http_status_code=403)
        with self.assertRaises(storage.StorageError):
            storage.head("avatars/7/a.webp")


class PutTest(StorageTestCase):
    def test_puts_validated_bytes_with_content_type(self):
        self.stubber.add_response(
            "put_object",
            {},
            {
                "Bucket": "test-uploads",
                "Key": "avatars/7/a.webp",
                "Body": b"image",
                "ContentType": "image/webp",
            },
        )

        storage.put("avatars/7/a.webp", b"image", "image/webp")
        self.stubber.assert_no_pending_responses()

    def test_put_error_raises_storage_error(self):
        self.stubber.add_client_error("put_object", service_error_code="AccessDenied", http_status_code=403)
        with self.assertRaises(storage.StorageError):
            storage.put("avatars/7/a.webp", b"image", "image/webp")


class PromoteTest(StorageTestCase):
    INFO = storage.ObjectInfo(size=1234, content_type="image/webp", etag='"abc"')

    def test_copies_only_verified_file_and_removes_temporary(self):
        self.stubber.add_response(
            "copy_object",
            {},
            {
                "Bucket": "test-uploads",
                "Key": "avatars/7/a.webp",
                "CopySource": {"Bucket": "test-uploads", "Key": "uploads/7/a.webp"},
                # 검증한 파일과 ETag가 같을 때만 복사한다.
                "CopySourceIfMatch": '"abc"',
            },
        )
        self.stubber.add_response("delete_object", {}, {"Bucket": "test-uploads", "Key": "uploads/7/a.webp"})

        self.assertEqual(storage.promote("uploads/7/a.webp", Folder.AVATAR, self.INFO), "avatars/7/a.webp")
        self.stubber.assert_no_pending_responses()

    def test_changed_or_missing_upload_is_not_promoted(self):
        for code, status in (("PreconditionFailed", 412), ("NoSuchKey", 404)):
            self.stubber.add_client_error("copy_object", service_error_code=code, http_status_code=status)
            with self.assertRaises(storage.UploadChangedError, msg=code):
                storage.promote("uploads/7/a.webp", Folder.AVATAR, self.INFO)
        # 복사하지 않았으면 임시 파일도 지우지 않는다(수명 주기 규칙이 치운다).
        self.stubber.assert_no_pending_responses()

    def test_other_errors_raise_storage_error(self):
        self.stubber.add_client_error("copy_object", service_error_code="AccessDenied", http_status_code=403)
        with self.assertRaises(storage.StorageError) as ctx:
            storage.promote("uploads/7/a.webp", Folder.AVATAR, self.INFO)
        self.assertNotIsInstance(ctx.exception, storage.UploadChangedError)

    def test_rejects_non_temporary_source_or_target(self):
        with self.assertRaises(ValueError):
            storage.promote("avatars/7/a.webp", Folder.RECORD_CARD, self.INFO)
        with self.assertRaises(ValueError):
            storage.promote("uploads/7/a.webp", Folder.UPLOAD, self.INFO)


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
        # 임시 폴더도 지운다.
        self.stubber.add_response(
            "list_objects_v2", {"IsTruncated": False}, {"Bucket": "test-uploads", "Prefix": "uploads/7/"}
        )
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
        self.stubber.add_response("list_objects_v2", {"IsTruncated": False})
        self.stubber.add_response(
            "list_objects_v2", {"Contents": [{"Key": "avatars/7/a.webp"}], "IsTruncated": False}
        )
        self.stubber.add_response(
            "delete_objects", {"Errors": [{"Key": "avatars/7/a.webp", "Code": "InternalError"}]}
        )
        with self.assertRaises(storage.StorageError):
            storage.delete_user_objects(7)

    def test_user_prefixes_include_every_folder(self):
        self.assertEqual(
            storage.user_prefixes(7),
            ("uploads/7/", "avatars/7/", "record-cards/7/"),
        )


if __name__ == "__main__":
    unittest.main()
