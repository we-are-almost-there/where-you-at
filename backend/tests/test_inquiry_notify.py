"""services/inquiry_notify.py 테스트 (실제 네트워크 요청 없음).

실행 (backend/ 에서):
    python -m unittest tests.test_inquiry_notify
"""

import unittest
from unittest.mock import MagicMock, patch

import httpx

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
    @patch("app.services.inquiry_notify.httpx.post")
    def test_without_webhook_url_does_nothing(self, post: MagicMock):
        with patch.object(settings, "inquiry_webhook_url", ""):
            self.assertFalse(notify_new_inquiry(CATEGORY, EMAIL, CONTENT))

        post.assert_not_called()

    @patch("app.services.inquiry_notify.httpx.post")
    def test_uses_webhook_url_from_settings(self, post: MagicMock):
        post.return_value.raise_for_status.return_value = None

        with patch.object(settings, "inquiry_webhook_url", SLACK):
            self.assertTrue(notify_new_inquiry(CATEGORY, EMAIL, CONTENT))

        self.assertEqual(post.call_args.args[0], SLACK)

    @patch("app.services.inquiry_notify.httpx.post")
    def test_non_slack_webhook_is_rejected(self, post: MagicMock):
        for url in ("https://example.com/hooks/not-slack", "https://["):
            with self.subTest(url=url), self.assertLogs("app.services.inquiry_notify", level="ERROR"):
                result = notify_new_inquiry(CATEGORY, EMAIL, CONTENT, webhook_url=url)

            self.assertFalse(result)
        post.assert_not_called()

    @patch("app.services.inquiry_notify.httpx.post")
    def test_posts_slack_json_with_custom_user_agent_and_short_timeout(self, post: MagicMock):
        post.return_value.raise_for_status.return_value = None

        self.assertTrue(notify_new_inquiry(CATEGORY, EMAIL, CONTENT, webhook_url=SLACK))

        post.assert_called_once_with(
            SLACK,
            json=build_payload(category=CATEGORY, email=EMAIL, content=CONTENT),
            headers={"User-Agent": "where-you-at-inquiry-notifier/1.0"},
            timeout=TIMEOUT_SECONDS,
        )
        self.assertEqual(TIMEOUT_SECONDS, 3)
        post.return_value.raise_for_status.assert_called_once_with()

    @patch("app.services.inquiry_notify.httpx.post")
    def test_failure_is_swallowed_without_logging_webhook_secret(self, post: MagicMock):
        post.side_effect = httpx.ConnectError(f"연결 실패: {SLACK}")

        with self.assertLogs("app.services.inquiry_notify", level="ERROR") as logs:
            result = notify_new_inquiry(CATEGORY, EMAIL, CONTENT, webhook_url=SLACK)

        self.assertFalse(result)
        self.assertNotIn(SLACK, "\n".join(logs.output))
        self.assertIn("ConnectError", "\n".join(logs.output))

    @patch("app.services.inquiry_notify.httpx.post")
    def test_http_failure_logs_status_without_webhook_secret(self, post: MagicMock):
        request = httpx.Request("POST", SLACK)
        response = httpx.Response(404, request=request)
        post.return_value.raise_for_status.side_effect = httpx.HTTPStatusError(
            f"폐기된 웹훅: {SLACK}", request=request, response=response
        )

        with self.assertLogs("app.services.inquiry_notify", level="ERROR") as logs:
            result = notify_new_inquiry(CATEGORY, EMAIL, CONTENT, webhook_url=SLACK)

        output = "\n".join(logs.output)
        self.assertFalse(result)
        self.assertIn("HTTPStatusError 404", output)
        self.assertNotIn(SLACK, output)


if __name__ == "__main__":
    unittest.main()
