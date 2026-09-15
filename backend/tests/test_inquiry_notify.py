"""services/inquiry_notify.py 테스트 (네트워크 없이 opener 대체).

실행 (backend/ 에서):
    python -m unittest tests.test_inquiry_notify
"""

import json
import unittest
from unittest.mock import MagicMock

from app.services.inquiry_notify import MESSAGE, build_payload, notify_new_inquiry

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
    def test_without_webhook_url_does_nothing(self):
        opener = MagicMock()

        self.assertFalse(
            notify_new_inquiry(CATEGORY, EMAIL, CONTENT, webhook_url="", opener=opener)
        )
        opener.assert_not_called()

    def test_non_slack_webhook_is_rejected(self):
        opener = MagicMock()

        for url in ("https://example.com/hooks/not-slack", "https://["):
            with self.subTest(url=url), self.assertLogs("app.services.inquiry_notify", level="ERROR"):
                result = notify_new_inquiry(CATEGORY, EMAIL, CONTENT, webhook_url=url, opener=opener)

            self.assertFalse(result)
        opener.assert_not_called()

    def test_posts_slack_json_with_custom_user_agent(self):
        opener = MagicMock()

        self.assertTrue(notify_new_inquiry(CATEGORY, EMAIL, CONTENT, webhook_url=SLACK, opener=opener))

        request = opener.call_args.args[0]
        headers = dict(request.header_items())
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.full_url, SLACK)
        self.assertEqual(headers["Content-type"], "application/json")
        self.assertNotIn("Python-urllib", headers["User-agent"])
        self.assertEqual(
            json.loads(request.data.decode("utf-8")),
            build_payload(category=CATEGORY, email=EMAIL, content=CONTENT),
        )

    def test_failure_is_swallowed_without_logging_webhook_secret(self):
        opener = MagicMock(side_effect=OSError(f"연결 실패: {SLACK}"))

        with self.assertLogs("app.services.inquiry_notify", level="ERROR") as logs:
            result = notify_new_inquiry(CATEGORY, EMAIL, CONTENT, webhook_url=SLACK, opener=opener)

        self.assertFalse(result)
        self.assertNotIn(SLACK, "\n".join(logs.output))
        self.assertIn("OSError", "\n".join(logs.output))


if __name__ == "__main__":
    unittest.main()
