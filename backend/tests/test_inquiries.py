"""POST /api/inquiries 라우터 테스트 (unittest, DB 없이 crud patch).

입력 검증, 동의 확인, 허니팟, 요청 횟수 제한이 라우터에서 올바르게 갈리는지 확인한다.
라우터는 검사를 통과한 뒤에만 DB에 연결하므로(get_db 의존성을 쓰지 않음), 연결 함수
app.deps.get_db_connection을 patch해 연결을 열었는지와 닫았는지를 함께 본다.

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
from app.main import app
from app.services import rate_limit


VALID = {
    "category": "코스 탐색",
    "email": "user@example.com",
    "content": "코스 경로가 실제 길과 달라요. 확인 부탁드립니다.",
    "agreed": True,
}


@patch("app.api.routers.inquiries.notify_new_inquiry")
@patch("app.api.routers.inquiries.inquiry_crud.create_inquiry")
class TestCreateInquiry(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        # 제한 기록은 모듈 전역이라 테스트끼리 섞이지 않게 매번 비운다.
        inquiries_router.inquiry_limiter.reset()
        connect_patcher = patch("app.deps.get_db_connection", return_value=MagicMock())
        self.connect = connect_patcher.start()
        self.addCleanup(connect_patcher.stop)

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

    def test_unverified_clients_share_one_limit(self, mock_create, mock_notify):
        # 이용자 IP를 확인하지 못한 요청은 서로 다른 헤더로 와도 한 키로 묶여 함께 막힌다(fail closed).
        # 로그인은 반대로 통과시키므로(test_auth.py) 문의 쪽 정책을 여기서 지킨다.
        headers = [{}, {"CF-Connecting-IP": "not-an-ip"}, {"CF-Connecting-IP": "1.2.3.4, 5.6.7.8"}]

        with patch.object(rate_limit.settings, "trust_cloudflare_ip_header", True):
            for header in headers:
                self.assertEqual(self.client.post("/api/inquiries", json=VALID, headers=header).status_code, 201)

            res = self.client.post("/api/inquiries", json=VALID)

        self.assertEqual(res.status_code, 429)
        self.assertEqual(mock_create.call_count, 3)

    def test_changing_xff_does_not_bypass_cloudflare_ip_limit(self, mock_create, mock_notify):
        with patch.object(rate_limit.settings, "trust_cloudflare_ip_header", True):
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

    def test_saved_inquiry_uses_one_connection_and_closes_it(self, mock_create, mock_notify):
        conn = self.connect.return_value

        self.client.post("/api/inquiries", json=VALID)

        self.connect.assert_called_once()
        mock_create.assert_called_once_with(
            conn, category="코스 탐색", email="user@example.com", content=VALID["content"]
        )
        conn.close.assert_called_once()

    def test_connection_is_closed_when_saving_fails(self, mock_create, mock_notify):
        mock_create.side_effect = RuntimeError("insert failed")

        with self.assertRaises(RuntimeError):
            self.client.post("/api/inquiries", json=VALID)

        self.connect.return_value.close.assert_called_once()
        mock_notify.assert_not_called()

    def test_honeypot_request_does_not_open_db_connection(self, mock_create, mock_notify):
        self.client.post("/api/inquiries", json={**VALID, "website": "x"})

        self.connect.assert_not_called()

    def test_rate_limited_request_does_not_open_db_connection(self, mock_create, mock_notify):
        for _ in range(3):
            self.client.post("/api/inquiries", json=VALID)
        self.assertEqual(self.connect.call_count, 3)

        res = self.client.post("/api/inquiries", json=VALID)

        self.assertEqual(res.status_code, 429)
        self.assertEqual(self.connect.call_count, 3)

    def test_db_unavailable_keeps_honeypot_success_and_returns_503_for_real_inquiry(
        self, mock_create, mock_notify
    ):
        self.connect.return_value = None

        honeypot = self.client.post("/api/inquiries", json={**VALID, "website": "x"})
        real = self.client.post("/api/inquiries", json=VALID)

        self.assertEqual(honeypot.status_code, 201)
        self.assertEqual(honeypot.json(), {"received": True})
        self.assertEqual(real.status_code, 503)
        mock_create.assert_not_called()
        mock_notify.assert_not_called()

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
