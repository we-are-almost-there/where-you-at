"""기록 카드 라우터(routers/record_cards.py) 테스트 (unittest, DB·R2 없이).

crud와 storage를 mock으로 바꾸고 인증은 의존성 override로 건너뛴다.

실행 (backend/ 에서):
    python -m unittest tests.test_record_cards
"""
import unittest
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from fastapi import HTTPException

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.services import storage

USER = CurrentUser(id=7, nickname="길손", bio=None, kakao_id=1, session_id=uuid4())
INFO = storage.ObjectInfo(size=1000, content_type="image/png", etag='"abc"')
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
            patch("app.api.routers.record_cards.storage.presign_download", return_value="https://r2/x"),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(app.dependency_overrides.clear)

    def post(self, upload_key="uploads/7/a.png"):
        return self.client.post("/api/record-cards", json={"record_id": 3, "upload_key": upload_key})

    def test_rejects_other_users_upload_key(self):
        with patch("app.api.routers.record_cards.crud") as crud, patch(
            "app.api.routers.record_cards.storage.head"
        ) as head:
            res = self.post("uploads/8/a.png")
        self.assertEqual(res.status_code, 400)
        crud.record_exists.assert_not_called()
        head.assert_not_called()

    def test_not_my_record_is_404_without_touching_storage(self):
        with patch("app.api.routers.record_cards.crud") as crud, patch(
            "app.api.routers.record_cards.storage.head"
        ) as head:
            crud.record_exists.return_value = False
            res = self.post()
        self.assertEqual(res.status_code, 404)
        head.assert_not_called()

    def test_oversized_image_is_deleted_and_rejected(self):
        big = storage.ObjectInfo(size=6 * 1024 * 1024, content_type="image/png", etag='"abc"')
        with patch("app.api.routers.record_cards.crud") as crud, patch(
            "app.api.routers.record_cards.storage.head", return_value=big
        ), patch("app.api.routers.record_cards.storage.delete") as delete, patch(
            "app.api.routers.record_cards.storage.promote"
        ) as promote:
            crud.record_exists.return_value = True
            res = self.post()
        self.assertEqual(res.status_code, 400)
        delete.assert_called_once_with("uploads/7/a.png")
        promote.assert_not_called()

    def test_record_deleted_after_check_rolls_back_image(self):
        with patch("app.api.routers.record_cards.crud") as crud, patch(
            "app.api.routers.record_cards.storage.head", return_value=INFO
        ), patch(
            "app.api.routers.record_cards.storage.promote", return_value="record-cards/7/a.png"
        ), patch("app.api.routers.record_cards.storage.delete") as delete:
            crud.record_exists.return_value = True
            crud.create_card.return_value = None
            res = self.post()
        self.assertEqual(res.status_code, 404)
        delete.assert_called_once_with("record-cards/7/a.png")

    def test_success_returns_card_with_download_url(self):
        with patch("app.api.routers.record_cards.crud") as crud, patch(
            "app.api.routers.record_cards.storage.head", return_value=INFO
        ), patch("app.api.routers.record_cards.storage.promote", return_value="record-cards/7/a.png"):
            crud.record_exists.return_value = True
            crud.create_card.return_value = CARD_ROW
            res = self.post()
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["image_url"], "https://r2/x")

    def test_db_failure_after_promote_deletes_final_image(self):
        with patch("app.api.routers.record_cards.crud") as crud, patch(
            "app.api.routers.record_cards.storage.head", return_value=INFO
        ), patch(
            "app.api.routers.record_cards.storage.promote", return_value="record-cards/7/a.png"
        ), patch("app.api.routers.record_cards.storage.delete") as delete:
            crud.record_exists.return_value = True
            crud.create_card.side_effect = RuntimeError("commit failed")
            with self.assertRaises(RuntimeError):
                self.post()
        delete.assert_called_once_with("record-cards/7/a.png")

    def test_db_connection_failure_after_promote_deletes_final_image(self):
        calls = {"n": 0}

        @contextmanager
        def flaky_db():
            calls["n"] += 1
            if calls["n"] == 2:  # 첫 호출은 소유권 확인, 두 번째가 저장
                raise HTTPException(status_code=503, detail="db down")
            yield object()

        with patch("app.api.routers.record_cards.db_connection", flaky_db), patch(
            "app.api.routers.record_cards.crud"
        ) as crud, patch("app.api.routers.record_cards.storage.head", return_value=INFO), patch(
            "app.api.routers.record_cards.storage.promote", return_value="record-cards/7/a.png"
        ), patch("app.api.routers.record_cards.storage.delete") as delete:
            crud.record_exists.return_value = True
            res = self.post()
        self.assertEqual(res.status_code, 503)
        delete.assert_called_once_with("record-cards/7/a.png")

    def test_quota_exceeded_is_409_and_deletes_final_image(self):
        with patch("app.api.routers.record_cards.crud") as crud, patch(
            "app.api.routers.record_cards.storage.head", return_value=INFO
        ), patch(
            "app.api.routers.record_cards.storage.promote", return_value="record-cards/7/a.png"
        ), patch("app.api.routers.record_cards.storage.delete") as delete:
            crud.CARD_QUOTA_EXCEEDED = "quota_exceeded"
            crud.record_exists.return_value = True
            crud.create_card.return_value = "quota_exceeded"
            res = self.post()
        self.assertEqual(res.status_code, 409)
        delete.assert_called_once_with("record-cards/7/a.png")


if __name__ == "__main__":
    unittest.main()
