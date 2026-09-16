"""services/inquiry_notify.py 테스트 (실제 네트워크 요청 없음).

실행 (backend/ 에서):
    python -m unittest tests.test_inquiry_notify
"""

import json
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

from app.core.config import settings
from app.services.inquiry_notify import (
    MESSAGE,
    TIMEOUT_SECONDS,
    build_payload,
    notify_new_inquiry,
)

SLACK = "https://hooks.slack.com/services/T000/B000/secret-token"
CATEGORY = "코스 탐색"
EMAIL = "user@example.com"
CONTENT = "코스 경로가 실제 길과 달라요. 확인 부탁드립니다."


def _respond(urlopen: MagicMock, body: bytes = b"ok") -> None:
    # urlopen은 with 문으로 쓰이므로 __enter__가 돌려주는 응답 객체의 본문을 정한다.
    urlopen.return_value.__enter__.return_value.read.return_value = body


class TestBuildPayload(unittest.TestCase):
    def test_payload_contains_inquiry_details_with_service_name(self):
        self.assertEqual(
            build_payload(category=CATEGORY, email=EMAIL, content=CONTENT),
            {
                "text": "[어디까지왔니] 새 1:1 문의가 있어요",
                "blocks": [
                    {
                        "type": "header",
                        "text": {"type": "plain_text", "text": "[어디까지왔니] 새 1:1 문의가 있어요"},
                    },
                    {
                        "type": "section",
                        "fields": [
                            {"type": "plain_text", "text": "문의 유형\n코스 탐색"},
                            {"type": "plain_text", "text": "이메일\nuser@example.com"},
                        ],
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "plain_text",
                            "text": "문의 내용\n코스 경로가 실제 길과 달라요. 확인 부탁드립니다.",
                        },
                    },
                ],
            },
        )
        self.assertEqual(MESSAGE, "[어디까지왔니] 새 1:1 문의가 있어요")

    def test_user_input_is_always_plain_text(self):
        payload = build_payload(
            category="기타",
            email="user@example.com",
            content="<!channel> <https://example.com|링크>",
        )

        blocks = payload["blocks"]
        self.assertIsInstance(blocks, list)
        for block in blocks:
            if "text" in block:
                self.assertEqual(block["text"]["type"], "plain_text")
            for field in block.get("fields", []):
                self.assertEqual(field["type"], "plain_text")


class TestNotifyNewInquiry(unittest.TestCase):
    @patch("app.services.inquiry_notify.urlopen")
    def test_without_webhook_url_does_nothing(self, urlopen: MagicMock):
        with patch.object(settings, "inquiry_webhook_url", ""):
            self.assertFalse(notify_new_inquiry(CATEGORY, EMAIL, CONTENT))

        urlopen.assert_not_called()

    @patch("app.services.inquiry_notify.urlopen")
    def test_uses_webhook_url_from_settings(self, urlopen: MagicMock):
        _respond(urlopen)
        with patch.object(settings, "inquiry_webhook_url", SLACK):
            self.assertTrue(notify_new_inquiry(CATEGORY, EMAIL, CONTENT))

        self.assertEqual(urlopen.call_args.args[0].full_url, SLACK)

    @patch("app.services.inquiry_notify.urlopen")
    def test_non_slack_webhook_is_rejected(self, urlopen: MagicMock):
        for url in ("https://example.com/hooks/not-slack", "https://["):
            with self.subTest(url=url), self.assertLogs("app.services.inquiry_notify", level="ERROR"):
                result = notify_new_inquiry(CATEGORY, EMAIL, CONTENT, webhook_url=url)

            self.assertFalse(result)
        urlopen.assert_not_called()

    @patch("app.services.inquiry_notify.urlopen")
    def test_posts_slack_json_with_custom_user_agent_and_short_timeout(self, urlopen: MagicMock):
        _respond(urlopen)
        self.assertTrue(notify_new_inquiry(CATEGORY, EMAIL, CONTENT, webhook_url=SLACK))

        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, SLACK)
        self.assertEqual(request.method, "POST")
        self.assertEqual(
            json.loads(request.data.decode("utf-8")),
            build_payload(category=CATEGORY, email=EMAIL, content=CONTENT),
        )
        self.assertEqual(request.get_header("Content-type"), "application/json")
        self.assertEqual(request.get_header("User-agent"), "where-you-at-inquiry-notifier/1.0")
        self.assertEqual(urlopen.call_args.kwargs, {"timeout": TIMEOUT_SECONDS})
        self.assertEqual(TIMEOUT_SECONDS, 3)

    @patch("app.services.inquiry_notify.urlopen")
    def test_non_ok_response_is_failure_without_logging_webhook_secret(self, urlopen: MagicMock):
        # 세그먼트가 빠진 웹훅 주소는 Slack이 302로 api.slack.com에 보내고, urlopen이 따라가 문서 페이지를 200으로 받는다.
        for body in (b"<!DOCTYPE html><html>", b"", b"invalid_payload"):
            with self.subTest(body=body):
                _respond(urlopen, body)
                with self.assertLogs(level="INFO") as logs:
                    result = notify_new_inquiry(CATEGORY, EMAIL, CONTENT, webhook_url=SLACK)

                output = "\n".join(logs.output)
                self.assertFalse(result)
                self.assertIn("ok가 아님", output)
                self.assertNotIn(SLACK, output)
                self.assertNotIn("/services/T000/B000/secret-token", output)

    @patch("app.services.inquiry_notify.urlopen")
    def test_failure_is_swallowed_without_logging_webhook_secret(self, urlopen: MagicMock):
        urlopen.side_effect = URLError(f"연결 실패: {SLACK}")

        with self.assertLogs(level="INFO") as logs:
            result = notify_new_inquiry(CATEGORY, EMAIL, CONTENT, webhook_url=SLACK)

        output = "\n".join(logs.output)
        self.assertFalse(result)
        self.assertNotIn(SLACK, output)
        self.assertNotIn("/services/T000/B000/secret-token", output)
        self.assertIn("URLError", output)

    @patch("app.services.inquiry_notify.urlopen")
    def test_http_failure_logs_status_without_webhook_secret(self, urlopen: MagicMock):
        error = HTTPError(SLACK, 404, f"폐기된 웹훅: {SLACK}", hdrs=None, fp=None)
        urlopen.side_effect = error

        try:
            with self.assertLogs(level="INFO") as logs:
                result = notify_new_inquiry(CATEGORY, EMAIL, CONTENT, webhook_url=SLACK)
        finally:
            error.close()

        output = "\n".join(logs.output)
        self.assertFalse(result)
        self.assertIn("HTTPError 404", output)
        self.assertNotIn(SLACK, output)
        self.assertNotIn("/services/T000/B000/secret-token", output)


if __name__ == "__main__":
    unittest.main()
