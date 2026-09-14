"""services/inquiry_notify.py 테스트 (unittest, 네트워크 없이 opener 대체).

실행 (backend/ 에서):
    python -m unittest tests.test_inquiry_notify
"""
import json
import unittest
from unittest.mock import MagicMock

from app.services.inquiry_notify import build_payload, notify_new_inquiry

DISCORD = "https://discord.com/api/webhooks/1/abc"
SLACK = "https://hooks.slack.com/services/T/B/C"
# 알림에는 유형만 담는다. 문구 전체를 비교해 번호·시각·이메일 같은 값이 섞여 들어가면 실패하게 한다.
EXPECTED_TEXT = "새 1:1 문의가 접수됐어요 (유형: 코스 탐색)\n이메일과 내용은 Supabase의 inquiry 테이블에서 확인해 주세요."


class TestBuildPayload(unittest.TestCase):
    def test_discord_uses_content_with_category_only(self):
        self.assertEqual(build_payload(DISCORD, "코스 탐색"), {"content": EXPECTED_TEXT})

    def test_slack_uses_text(self):
        self.assertEqual(build_payload(SLACK, "코스 탐색"), {"text": EXPECTED_TEXT})


class TestNotifyNewInquiry(unittest.TestCase):
    def test_without_webhook_url_does_nothing(self):
        opener = MagicMock()

        self.assertFalse(notify_new_inquiry("기타", webhook_url="", opener=opener))
        opener.assert_not_called()

    def test_posts_json_with_custom_user_agent(self):
        opener = MagicMock()

        self.assertTrue(notify_new_inquiry("코스 탐색", webhook_url=DISCORD, opener=opener))

        request = opener.call_args.args[0]
        headers = dict(request.header_items())
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.full_url, DISCORD)
        self.assertEqual(headers["Content-type"], "application/json")
        self.assertNotIn("Python-urllib", headers["User-agent"])
        self.assertEqual(json.loads(request.data.decode("utf-8")), {"content": EXPECTED_TEXT})

    def test_failure_is_swallowed_and_reported_as_false(self):
        opener = MagicMock(side_effect=OSError("연결 거부"))

        self.assertFalse(notify_new_inquiry("기타", webhook_url=DISCORD, opener=opener))


if __name__ == "__main__":
    unittest.main()
