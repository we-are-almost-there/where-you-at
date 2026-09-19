"""services/slack_notify.py의 연결 끊기 웹훅 알림 테스트 (실제 네트워크 요청 없음).

전송 자체(주소 검증, 타임아웃, 비밀 노출 없음)는 tests/test_inquiry_notify.py가 같은 경로로 확인한다.
여기서는 알림 내용에 개인정보가 들어가지 않는지와 설정한 주소로 나가는지만 본다.

실행 (backend/ 에서):
    python -m unittest tests.test_slack_notify
"""

import json
import unittest
from unittest.mock import MagicMock, patch

from app.core.config import settings
from app.services.slack_notify import notify_unlink_failure

SLACK = "https://hooks.slack.com/services/T000/B000/secret-token"


@patch("app.services.slack_notify.urlopen")
class TestNotifyUnlinkFailure(unittest.TestCase):
    def setUp(self):
        url_patcher = patch.object(settings, "inquiry_webhook_url", SLACK)
        url_patcher.start()
        self.addCleanup(url_patcher.stop)

    def test_sends_fixed_message_without_personal_data(self, urlopen: MagicMock):
        urlopen.return_value.__enter__.return_value.read.return_value = b"ok"

        self.assertTrue(notify_unlink_failure())

        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, SLACK)
        # 어느 회원인지는 Render 로그의 kakao_id로만 확인한다. Slack에는 회원번호를 보내지 않는다.
        self.assertEqual(
            json.loads(request.data.decode("utf-8")),
            {"text": "[어디까지왔니] 연결 끊기 웹훅 처리 실패, Render 로그 확인 필요"},
        )

    def test_without_webhook_url_does_nothing(self, urlopen: MagicMock):
        with patch.object(settings, "inquiry_webhook_url", ""):
            self.assertFalse(notify_unlink_failure())

        urlopen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
