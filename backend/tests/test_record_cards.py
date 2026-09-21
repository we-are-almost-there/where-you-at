"""기록 카드 라우터(routers/record_cards.py) 테스트 (unittest, DB·R2 없이).

crud와 storage를 mock으로 바꾸고 인증은 의존성 override로 건너뛴다.

실행 (backend/ 에서):
    python -m unittest tests.test_record_cards
"""
import unittest
import json
from io import BytesIO
from PIL import Image
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from fastapi import HTTPException, Request

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.services import storage
from app.api.routers import record_cards as record_cards_router

USER = CurrentUser(id=7, nickname="길손", bio=None, kakao_id=1, session_id=uuid4())
def image_bytes(format="PNG", size=(1080, 1920)):
    out = BytesIO()
    Image.new("RGB", size, "purple").save(out, format=format)
    return out.getvalue()


PNG = image_bytes()
NOW = datetime(2026, 9, 20, tzinfo=timezone.utc)

CARD_ROW = {
    "card_id": 1,
    "image_key": "record-cards/7/a.png",
    "card_created_at": NOW,
    "id": 3,
    "course_id": 5,
    "course_name": "코스",
    "route_type": "trail",
    "distance_km": 5.0,
    "duration_ms": 3000000,
    "pace_sec_per_km": 600.0,
    "finished_at": NOW,
    "is_completed": True,
}


@contextmanager
def fake_db():
    yield object()


class CreateCardTest(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[get_current_user] = lambda: USER
        self.client = TestClient(app)
        patches = [
            patch("app.api.routers.record_cards.db_connection", fake_db),
            patch("app.api.routers.record_cards.storage.is_configured", return_value=True),
            patch("app.api.routers.record_cards.storage.new_key", return_value="record-cards/7/a.png"),
            patch("app.api.routers.record_cards.crud.count_cards", return_value=0),
            patch("app.api.routers.record_cards.storage.presign_download", return_value="https://r2/x"),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        record_cards_router.create_card_limiter.reset()
        f = patch("app.deps.settings.record_features_enabled", True)
        f.start()
        self.addCleanup(f.stop)
        self.addCleanup(app.dependency_overrides.clear)

    def post(self, data=PNG, content_type="image/png", headers=None):
        return self.client.post("/api/record-cards?record_id=3", content=data,
                                headers={"Content-Type": content_type, **(headers or {})})

    def test_not_my_record_is_404_without_touching_storage(self):
        with patch("app.api.routers.record_cards.crud") as crud, patch(
            "app.api.routers.record_cards.storage.put"
        ) as put:
            crud.record_exists.return_value = False
            res = self.post()
        self.assertEqual(res.status_code, 404)
        put.assert_not_called()

    def test_cleanup_failure_notifies_and_preserves_original_error(self):
        for cause, status in (("upload", 502), ("db", None), ("quota", 409), ("deleted", 404)):
            for slack_fails in (False, True):
                with self.subTest(cause=cause, slack_fails=slack_fails), patch(
                    "app.api.routers.record_cards.crud"
                ) as crud, patch("app.api.routers.record_cards.storage.put") as put, patch(
                    "app.api.routers.record_cards.storage.delete", side_effect=storage.StorageError("delete failed")
                ) as delete, patch(
                    "app.services.record_card_notify.settings.inquiry_webhook_url",
                    "https://hooks.slack.com/services/T000/B000/test",
                ), patch("app.services.slack_notify.urlopen") as urlopen:
                    crud.record_exists.return_value = True
                    crud.count_cards.return_value = 0
                    crud.MAX_CARDS_PER_USER = 100
                    crud.CARD_QUOTA_EXCEEDED = "quota_exceeded"
                    crud.card_exists_with_image.return_value = False
                    original_error = RuntimeError("original DB error")
                    if cause == "upload":
                        put.side_effect = storage.StorageError("upload failed")
                    elif cause == "db":
                        crud.create_card.side_effect = original_error
                    else:
                        crud.create_card.return_value = "quota_exceeded" if cause == "quota" else None
                    if slack_fails:
                        urlopen.side_effect = TimeoutError("Slack unavailable")
                    else:
                        urlopen.return_value.__enter__.return_value.read.return_value = b"ok"

                    if status is None:
                        with self.assertRaises(RuntimeError) as raised:
                            self.post()
                        self.assertIs(raised.exception, original_error)
                    else:
                        self.assertEqual(self.post().status_code, status)

                    delete.assert_called_once_with("record-cards/7/a.png")
                    urlopen.assert_called_once()
                    payload = json.loads(urlopen.call_args.args[0].data)
                    message = "[어디까지왔니] 고아 기록 카드 이미지 삭제 실패, Render 로그 확인 필요"
                    self.assertEqual(payload, {
                        "text": message,
                        "blocks": [{"type": "header", "text": {"type": "plain_text", "text": message}}],
                    })

    def test_cleanup_success_does_not_notify(self):
        with patch("app.api.routers.record_cards.storage.delete") as delete, patch(
            "app.api.routers.record_cards.record_card_notify.notify_cleanup_failure"
        ) as notify:
            record_cards_router._discard_card_image("record-cards/7/a.png")
        delete.assert_called_once_with("record-cards/7/a.png")
        notify.assert_not_called()

    def test_cleanup_failure_without_webhook_does_not_send(self):
        with patch(
            "app.api.routers.record_cards.storage.delete", side_effect=storage.StorageError("delete failed")
        ), patch("app.services.record_card_notify.settings.inquiry_webhook_url", ""), patch(
            "app.services.slack_notify.urlopen"
        ) as urlopen:
            record_cards_router._discard_card_image("record-cards/7/a.png")
        urlopen.assert_not_called()

    def test_invalid_images_never_reach_r2_or_card_insert(self):
        cases = [
            (b"", "image/png", 400),
            (b"not an image", "image/png", 400),
            (PNG, "image/jpeg", 400),
            (PNG[:100], "image/png", 400),
            (image_bytes("GIF"), "image/png", 400),
            (image_bytes(size=(2001, 2000)), "image/png", 400),
            (b"x" * (record_cards_router.MAX_CARD_IMAGE_BYTES + 1), "image/png", 413),
        ]
        with patch("app.api.routers.record_cards.crud.record_exists", return_value=True), patch(
            "app.api.routers.record_cards.storage.put"
        ) as put, patch("app.api.routers.record_cards.crud.create_card") as insert:
            for data, mime, status in cases:
                with self.subTest(size=len(data), mime=mime):
                    self.assertEqual(self.post(data, mime).status_code, status)
            put.assert_not_called()
            insert.assert_not_called()

    def test_supported_images_are_decoded_before_storage(self):
        with patch("app.api.routers.record_cards.crud.record_exists", return_value=True), patch(
            "app.api.routers.record_cards.crud.create_card", return_value=CARD_ROW
        ), patch("app.api.routers.record_cards.storage.put") as put:
            for format, mime in (("PNG", "image/png"), ("JPEG", "image/jpeg"), ("WEBP", "image/webp")):
                with self.subTest(format=format):
                    data = image_bytes(format)
                    self.assertEqual(self.post(data, mime).status_code, 201)
                    put.assert_called_with("record-cards/7/a.png", data, mime)

    def test_upload_failure_attempts_cleanup_without_card_insert(self):
        with patch("app.api.routers.record_cards.crud.record_exists", return_value=True), patch(
            "app.api.routers.record_cards.storage.put", side_effect=storage.StorageError("timeout")
        ), patch("app.api.routers.record_cards.storage.delete") as delete, patch(
            "app.api.routers.record_cards.crud.create_card"
        ) as insert:
            self.assertEqual(self.post().status_code, 502)
        delete.assert_called_once_with("record-cards/7/a.png")
        insert.assert_not_called()

    def test_old_direct_upload_api_is_unavailable(self):
        self.assertEqual(self.client.post("/api/record-cards/upload-url",
                                         json={"content_type": "image/png"}).status_code, 404)

    def test_record_deleted_after_check_rolls_back_image(self):
        with patch("app.api.routers.record_cards.crud") as crud, patch(
            "app.api.routers.record_cards.storage.put"
        ), patch("app.api.routers.record_cards.storage.delete") as delete:
            crud.record_exists.return_value = True
            crud.count_cards.return_value = 0
            crud.MAX_CARDS_PER_USER = 100
            crud.create_card.return_value = None
            res = self.post()
        self.assertEqual(res.status_code, 404)
        delete.assert_called_once_with("record-cards/7/a.png")

    def test_success_returns_card_with_download_url(self):
        with patch("app.api.routers.record_cards.crud") as crud, patch("app.api.routers.record_cards.storage.put"):
            crud.record_exists.return_value = True
            crud.count_cards.return_value = 0
            crud.MAX_CARDS_PER_USER = 100
            crud.create_card.return_value = CARD_ROW
            res = self.post()
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["image_url"], "https://r2/x")

    def test_db_failure_after_upload_deletes_final_image(self):
        with patch("app.api.routers.record_cards.crud") as crud, patch(
            "app.api.routers.record_cards.storage.put"
        ), patch("app.api.routers.record_cards.storage.delete") as delete:
            crud.record_exists.return_value = True
            crud.count_cards.return_value = 0
            crud.MAX_CARDS_PER_USER = 100
            crud.create_card.side_effect = RuntimeError("commit failed")
            crud.card_exists_with_image.return_value = False  # 검증 결과 커밋 안 됨
            with self.assertRaises(RuntimeError):
                self.post()
        delete.assert_called_once_with("record-cards/7/a.png")

    def test_db_connection_failure_after_upload_deletes_final_image(self):
        calls = {"n": 0}

        @contextmanager
        def flaky_db():
            calls["n"] += 1
            if calls["n"] == 2:  # 첫 호출은 소유권 확인, 두 번째가 저장
                raise HTTPException(status_code=503, detail="db down")
            yield object()

        with patch("app.api.routers.record_cards.db_connection", flaky_db), patch(
            "app.api.routers.record_cards.crud"
        ) as crud, patch(
            "app.api.routers.record_cards.storage.put"
        ), patch("app.api.routers.record_cards.storage.delete") as delete:
            crud.record_exists.return_value = True
            crud.count_cards.return_value = 0
            crud.MAX_CARDS_PER_USER = 100
            crud.card_exists_with_image.return_value = False  # 검증용 세 번째 연결은 성공, 결과는 "없음"
            res = self.post()
        self.assertEqual(res.status_code, 503)
        delete.assert_called_once_with("record-cards/7/a.png")

    def test_quota_exceeded_is_409_and_deletes_final_image(self):
        with patch("app.api.routers.record_cards.crud") as crud, patch(
            "app.api.routers.record_cards.storage.put"
        ), patch("app.api.routers.record_cards.storage.delete") as delete:
            crud.CARD_QUOTA_EXCEEDED = "quota_exceeded"
            crud.record_exists.return_value = True
            crud.count_cards.return_value = 0
            crud.MAX_CARDS_PER_USER = 100
            crud.create_card.return_value = "quota_exceeded"
            res = self.post()
        self.assertEqual(res.status_code, 409)
        delete.assert_called_once_with("record-cards/7/a.png")

    def test_create_card_rate_limited_is_429(self):
        with patch("app.api.routers.record_cards.crud") as crud:
            crud.record_exists.return_value = False
            codes = [self.post().status_code for _ in range(31)]
        self.assertEqual(codes[-1], 429)
        self.assertEqual(set(codes[:-1]), {404})

    def test_upload_rejected_when_quota_full(self):
        with patch("app.api.routers.record_cards.crud") as crud, patch(
            "app.api.routers.record_cards.storage.new_key"
        ) as new_key:
            crud.MAX_CARDS_PER_USER = 100
            crud.count_cards.return_value = 100
            res = self.post()
        self.assertEqual(res.status_code, 409)
        new_key.assert_not_called()

    def test_exception_after_actual_commit_keeps_image(self):
        """commit()은 서버에서 성공했는데 응답 직전에 예외가 나는 경우 — 이미지를 지우면 안 된다."""
        with patch("app.api.routers.record_cards.crud") as crud, patch(
            "app.api.routers.record_cards.storage.put"
        ), patch("app.api.routers.record_cards.storage.delete") as delete:
            crud.record_exists.return_value = True
            crud.count_cards.return_value = 0
            crud.MAX_CARDS_PER_USER = 100
            crud.create_card.side_effect = RuntimeError("response lost after commit")
            crud.card_exists_with_image.return_value = True  # 검증 결과 실제로는 커밋됨
            with self.assertRaises(RuntimeError):
                self.post()
        delete.assert_not_called()

    def test_verification_failure_after_exception_keeps_image_and_notifies(self):
        """저장도 실패하고 재확인용 연결도 실패하면, 이미지는 지우지 않고 Slack으로 알린다."""
        calls = {"n": 0}

        @contextmanager
        def flaky():
            calls["n"] += 1
            if calls["n"] == 1:
                yield object()  # 소유권 확인은 성공
            else:
                raise HTTPException(status_code=503, detail="db down")

        with patch("app.api.routers.record_cards.crud") as crud, patch(
            "app.api.routers.record_cards.storage.put"
        ), patch("app.api.routers.record_cards.storage.delete") as delete, patch(
            "app.api.routers.record_cards.db_connection"
        ) as db_conn, patch("app.api.routers.record_cards.record_card_notify") as notify:
            db_conn.side_effect = flaky
            crud.record_exists.return_value = True
            crud.count_cards.return_value = 0
            crud.MAX_CARDS_PER_USER = 100
            res = self.post()
        self.assertEqual(res.status_code, 503)
        delete.assert_not_called()
        notify.notify_reconciliation_failure.assert_called_once_with()


class CardBodyTest(unittest.IsolatedAsyncioTestCase):
    async def test_stream_limit_ignores_missing_or_forged_content_length(self):
        for headers in ([], [(b"content-length", b"1")]):
            chunks = iter([b"a" * record_cards_router.MAX_CARD_IMAGE_BYTES, b"b"])

            async def receive():
                return {"type": "http.request", "body": next(chunks), "more_body": True}

            request = Request({"type": "http", "headers": headers}, receive)
            with self.assertRaises(HTTPException) as result:
                await record_cards_router._card_body(request)
            self.assertEqual(result.exception.status_code, 413)

    async def test_exact_limit_is_accepted(self):
        data = b"a" * record_cards_router.MAX_CARD_IMAGE_BYTES

        async def receive():
            return {"type": "http.request", "body": data, "more_body": False}

        request = Request({"type": "http", "headers": []}, receive)
        self.assertEqual(await record_cards_router._card_body(request), data)

    async def test_invalid_or_oversized_header_rejected_before_read(self):
        async def receive():
            self.fail("Body must not be read")

        for length, status in ((b"invalid", 400), (b"-1", 400), (b"5242881", 413)):
            request = Request({"type": "http", "headers": [(b"content-length", length)]}, receive)
            with self.assertRaises(HTTPException) as result:
                await record_cards_router._card_body(request)
            self.assertEqual(result.exception.status_code, status)


class ListCardsTest(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[get_current_user] = lambda: USER
        self.client = TestClient(app)
        for p in (
            patch("app.api.routers.record_cards.db_connection", fake_db),
            patch("app.api.routers.record_cards.storage.presign_download", return_value="https://r2/x"),
        ):
            p.start()
            self.addCleanup(p.stop)
        f = patch("app.deps.settings.record_features_enabled", True)
        f.start()
        self.addCleanup(f.stop)
        self.addCleanup(app.dependency_overrides.clear)

    def test_returns_one_page_and_presigns_only_that_page(self):
        with patch("app.api.routers.record_cards.crud") as crud:
            crud.list_cards.return_value = (30, [CARD_ROW, {**CARD_ROW, "card_id": 2}])
            res = self.client.get("/api/record-cards?page=2&size=2")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual((data["total_count"], data["page"], data["size"]), (30, 2, 2))
        self.assertEqual(len(data["cards"]), 2)
        kwargs = crud.list_cards.call_args.kwargs
        self.assertEqual((kwargs["page"], kwargs["size"]), (2, 2))

    def test_size_over_max_is_422(self):
        with patch("app.api.routers.record_cards.crud"):
            self.assertEqual(self.client.get("/api/record-cards?size=51").status_code, 422)
            self.assertEqual(self.client.get("/api/record-cards?page=0").status_code, 422)


if __name__ == "__main__":
    unittest.main()
