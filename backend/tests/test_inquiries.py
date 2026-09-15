"""POST /api/inquiries 라우터 테스트 (unittest, DB 없이 crud patch).

test_course_gpx.py와 같은 방식이다. 입력 검증, 동의 확인, 허니팟, 요청 횟수 제한이
라우터에서 올바르게 갈리는지 확인한다.

다루지 않음 (DB가 있어야 확인 가능):
    - inquiry 테이블의 check 제약과 consented_at 저장
    - 완료로 바꿀 때 resolved_at이 채워지는 트리거

실행 (backend/ 에서):
    python -m unittest tests.test_inquiries
"""
import unittest
from unittest.mock import ANY, MagicMock, patch

from fastapi.testclient import TestClient

from app.api.routers import inquiries as inquiries_router
from app.deps import get_db
from app.main import app


def _override_get_db():
    yield MagicMock()


VALID = {
    "category": "코스 탐색",
    "email": "user@example.com",
    "content": "코스 경로가 실제 길과 달라요. 확인 부탁드립니다.",
    "agreed": True,
}


@patch("app.api.routers.inquiries.inquiry_crud.create_inquiry")
class TestCreateInquiry(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = _override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(get_db, None)

    def setUp(self):
        # 제한 기록은 모듈 전역이라 테스트끼리 섞이지 않게 매번 비운다.
        inquiries_router.inquiry_limiter.reset()

    def test_valid_inquiry_is_saved(self, mock_create):
        res = self.client.post("/api/inquiries", json=VALID)

        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json(), {"received": True})
        mock_create.assert_called_once_with(
            ANY, category="코스 탐색", email="user@example.com", content=VALID["content"]
        )

    def test_email_and_content_are_trimmed_before_saving(self, mock_create):
        res = self.client.post(
            "/api/inquiries",
            json={**VALID, "email": "  user@example.com ", "content": "\n  " + VALID["content"] + "  \n"},
        )

        self.assertEqual(res.status_code, 201)
        mock_create.assert_called_once_with(
            ANY, category="코스 탐색", email="user@example.com", content=VALID["content"]
        )

    def test_invalid_input_returns_422_without_saving(self, mock_create):
        cases = {
            "이메일 형식이 아님": {**VALID, "email": "user-at-example.com"},
            "이메일이 너무 김": {**VALID, "email": "a" * 250 + "@x.kr"},
            "공백을 빼면 10자 미만": {**VALID, "content": "   짧아요     "},
            "2000자 초과": {**VALID, "content": "가" * 2001},
            "동의하지 않음": {**VALID, "agreed": False},
            "없는 문의 유형": {**VALID, "category": "결제"},
            "이메일 누락": {k: v for k, v in VALID.items() if k != "email"},
        }
        for name, body in cases.items():
            with self.subTest(name):
                res = self.client.post("/api/inquiries", json=body)
                self.assertEqual(res.status_code, 422)
        mock_create.assert_not_called()

    def test_honeypot_filled_responds_success_but_does_not_save(self, mock_create):
        res = self.client.post("/api/inquiries", json={**VALID, "website": "https://spam.example"})

        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json(), {"received": True})
        mock_create.assert_not_called()

    def test_fourth_inquiry_within_window_is_rejected(self, mock_create):
        for _ in range(3):
            self.assertEqual(self.client.post("/api/inquiries", json=VALID).status_code, 201)

        res = self.client.post("/api/inquiries", json=VALID)

        self.assertEqual(res.status_code, 429)
        self.assertEqual(mock_create.call_count, 3)

    def test_honeypot_requests_do_not_use_up_the_limit(self, mock_create):
        for _ in range(5):
            self.client.post("/api/inquiries", json={**VALID, "website": "x"})

        res = self.client.post("/api/inquiries", json=VALID)

        self.assertEqual(res.status_code, 201)
        mock_create.assert_called_once()


if __name__ == "__main__":
    unittest.main()
