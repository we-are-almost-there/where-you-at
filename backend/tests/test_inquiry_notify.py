"""services/inquiry_notify.py 테스트 (unittest, 네트워크 없이 opener 대체).

실행 (backend/ 에서):
    python -m unittest tests.test_inquiry_notify
"""
import json
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.services.inquiry_notify import build_payload, notify_new_inquiry

RECEIVED = datetime(2026, 9, 14, 3, 5, tzinfo=timezone.utc)  # 한국 시간 12:05
DISCORD = "https://discord.com/api/webhooks/1/abc"
SLACK = "https://hooks.slack.com/services/T/B/C"


class TestBuildPayload(unittest.TestCase):
    def test_discord_uses_content_with_number_category_and_kst_time(self):
        payload = build_payload(DISCORD, 12, "코스 탐색", RECEIVED)

        self.assertEqual(list(payload), ["content"])
        self.assertIn("#12", payload["content"])
        self.assertIn("코스 탐색", payload["content"])
        self.assertIn("2026-09-14 12:05 KST", payload["content"])

    def test_slack_uses_text(self):
        self.assertEqual(list(build_payload(SLACK, 12, "기타", RECEIVED)), ["text"])


class TestNotifyNewInquiry(unittest.TestCase):
    def test_without_webhook_url_does_nothing(self):
        opener = MagicMock()

        self.assertFalse(notify_new_inquiry(1, "기타", received_at=RECEIVED, webhook_url="", opener=opener))
        opener.assert_not_called()

    def test_posts_json_with_custom_user_agent(self):
        opener = MagicMock()

        self.assertTrue(notify_new_inquiry(12, "코스 탐색", received_at=RECEIVED, webhook_url=DISCORD, opener=opener))

        request = opener.call_args.args[0]
        headers = dict(request.header_items())
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.full_url, DISCORD)
        self.assertEqual(headers["Content-type"], "application/json")
        self.assertNotIn("Python-urllib", headers["User-agent"])
        body = json.loads(request.data.decode("utf-8"))
        self.assertIn("#12", body["content"])

    def test_failure_is_swallowed_and_reported_as_false(self):
        opener = MagicMock(side_effect=OSError("연결 거부"))

        self.assertFalse(notify_new_inquiry(12, "기타", received_at=RECEIVED, webhook_url=DISCORD, opener=opener))


if __name__ == "__main__":
    unittest.main()
