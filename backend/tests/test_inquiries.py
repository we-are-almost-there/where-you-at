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
from starlette.requests import Request

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


def _request(*, headers=None, client=("203.0.113.10", 12345)):
    header_items = headers.items() if isinstance(headers, dict) else (headers or [])
    return Request(
        {
            "type": "http",
            "headers": [(name.lower().encode(), value.encode()) for name, value in header_items],
            "client": client,
        }
    )


class TestClientKey(unittest.TestCase):
    def test_local_mode_ignores_forwarding_headers(self):
        request = _request(
            headers={
                "X-Forwarded-For": "1.2.3.4",
                "CF-Connecting-IP": "5.6.7.8",
            }
        )

        with patch.object(inquiries_router.settings, "trust_cloudflare_ip_header", False):
            self.assertEqual(inquiries_router._client_key(request), "203.0.113.10")

    def test_render_mode_uses_valid_cloudflare_ip_and_ignores_xff(self):
        request = _request(
            headers={
                "X-Forwarded-For": "1.2.3.4",
                "CF-Connecting-IP": "198.51.100.23",
            }
        )

        with patch.object(inquiries_router.settings, "trust_cloudflare_ip_header", True):
            self.assertEqual(inquiries_router._client_key(request), "198.51.100.23")

    def test_render_mode_groups_ipv6_by_64_prefix(self):
        # 같은 /64 안에서 주소만 바꿔도(표기가 달라도) 같은 키, 다른 /64는 다른 키여야 한다.
        same_prefix = [
            _request(headers={"CF-Connecting-IP": "2001:0db8:0:0:0:0:0:1"}),
            _request(headers={"CF-Connecting-IP": "2001:db8::ffff:1234"}),
        ]
        other_prefix = _request(headers={"CF-Connecting-IP": "2001:db8:0:1::1"})

        with patch.object(inquiries_router.settings, "trust_cloudflare_ip_header", True):
            self.assertEqual(
                [inquiries_router._client_key(request) for request in same_prefix],
                ["2001:db8::/64", "2001:db8::/64"],
            )
            self.assertEqual(inquiries_router._client_key(other_prefix), "2001:db8:0:1::/64")

    def test_render_mode_fails_closed_for_missing_or_invalid_header(self):
        requests = [
            _request(),
            _request(headers={"CF-Connecting-IP": "1.2.3.4, 5.6.7.8"}),
            _request(headers={"CF-Connecting-IP": "not-an-ip"}),
            _request(
                headers=[
                    ("CF-Connecting-IP", "1.2.3.4"),
                    ("CF-Connecting-IP", "5.6.7.8"),
                ]
            ),
        ]

        with patch.object(inquiries_router.settings, "trust_cloudflare_ip_header", True):
            self.assertEqual(
                [inquiries_router._client_key(request) for request in requests],
                ["unverified-cloudflare-client"] * 4,
            )


@patch("app.api.routers.inquiries.notify_new_inquiry")
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

    def test_valid_inquiry_is_saved_and_notification_is_scheduled(self, mock_create, mock_notify):
        res = self.client.post("/api/inquiries", json=VALID)

        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json(), {"received": True})
        mock_create.assert_called_once_with(
            ANY, category="코스 탐색", email="user@example.com", content=VALID["content"]
        )
        mock_notify.assert_called_once_with(
            category="코스 탐색", email="user@example.com", content=VALID["content"]
        )

    def test_email_and_content_are_trimmed_before_saving(self, mock_create, mock_notify):
        res = self.client.post(
            "/api/inquiries",
            json={**VALID, "email": "  user@example.com ", "content": "\n  " + VALID["content"] + "  \n"},
        )

        self.assertEqual(res.status_code, 201)
        mock_create.assert_called_once_with(
            ANY, category="코스 탐색", email="user@example.com", content=VALID["content"]
        )
        mock_notify.assert_called_once_with(
            category="코스 탐색", email="user@example.com", content=VALID["content"]
        )

    def test_invalid_input_returns_422_without_saving(self, mock_create, mock_notify):
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
        mock_notify.assert_not_called()

    def test_honeypot_filled_responds_success_but_does_not_save(self, mock_create, mock_notify):
        res = self.client.post("/api/inquiries", json={**VALID, "website": "https://spam.example"})

        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json(), {"received": True})
        mock_create.assert_not_called()
        mock_notify.assert_not_called()

    def test_fourth_inquiry_within_window_is_rejected(self, mock_create, mock_notify):
        for _ in range(3):
            self.assertEqual(self.client.post("/api/inquiries", json=VALID).status_code, 201)

        res = self.client.post("/api/inquiries", json=VALID)

        self.assertEqual(res.status_code, 429)
        self.assertEqual(mock_create.call_count, 3)
        self.assertEqual(mock_notify.call_count, 3)

    def test_changing_xff_does_not_bypass_cloudflare_ip_limit(self, mock_create, mock_notify):
        with patch.object(inquiries_router.settings, "trust_cloudflare_ip_header", True):
            for forged_ip in ("1.1.1.1", "2.2.2.2", "3.3.3.3"):
                res = self.client.post(
                    "/api/inquiries",
                    json=VALID,
                    headers={
                        "CF-Connecting-IP": "203.0.113.50",
                        "X-Forwarded-For": forged_ip,
                    },
                )
                self.assertEqual(res.status_code, 201)

            res = self.client.post(
                "/api/inquiries",
                json=VALID,
                headers={
                    "CF-Connecting-IP": "203.0.113.50",
                    "X-Forwarded-For": "4.4.4.4",
                },
            )

        self.assertEqual(res.status_code, 429)
        self.assertEqual(mock_create.call_count, 3)
        self.assertEqual(mock_notify.call_count, 3)

    def test_honeypot_requests_do_not_use_up_the_limit(self, mock_create, mock_notify):
        for _ in range(5):
            self.client.post("/api/inquiries", json={**VALID, "website": "x"})

        res = self.client.post("/api/inquiries", json=VALID)

        self.assertEqual(res.status_code, 201)
        mock_create.assert_called_once()
        mock_notify.assert_called_once_with(
            category="코스 탐색", email="user@example.com", content=VALID["content"]
        )

    def test_notification_failure_does_not_change_saved_response(self, mock_create, mock_notify):
        mock_notify.return_value = False

        res = self.client.post("/api/inquiries", json=VALID)

        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json(), {"received": True})
        mock_create.assert_called_once()
        mock_notify.assert_called_once_with(
            category="코스 탐색", email="user@example.com", content=VALID["content"]
        )


if __name__ == "__main__":
    unittest.main()
