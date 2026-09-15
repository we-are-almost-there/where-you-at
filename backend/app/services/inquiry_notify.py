"""Slack으로 새 1:1 문의 내용을 알린다.

INQUIRY_WEBHOOK_URL이 비어 있으면 아무것도 하지 않는다. 알림은 문의 저장 뒤 백그라운드에서 보내며,
실패해도 문의 접수에는 영향을 주지 않는다.

운영팀이 DB를 열지 않고 문의를 확인할 수 있도록 문의 유형·이메일·내용을 보낸다. 문의 번호와 접수 시각은
보내지 않는다. 전송 항목을 바꾸면 개인정보처리방침 7·8번도 함께 고친다.
"""

import json
import logging
import os
import urllib.request
from urllib.parse import urlparse

LOGGER = logging.getLogger(__name__)
MESSAGE = "[어디까지왔니] 새 1:1 문의가 있어요"
TIMEOUT_SECONDS = 5


def _plain_text(text: str) -> dict[str, str]:
    # 이용자가 입력한 Slack 마크업이나 멘션이 실행되지 않게 모든 입력을 plain_text로 보낸다.
    return {"type": "plain_text", "text": text}


def build_payload(*, category: str, email: str, content: str) -> dict[str, object]:
    """알림용 고정 제목과 운영에 필요한 문의 정보를 Slack Block Kit 형식으로 만든다."""
    return {
        # blocks를 표시하지 못하는 환경과 모바일 알림에 쓰이는 대체 문구에는 개인정보를 넣지 않는다.
        "text": MESSAGE,
        "blocks": [
            {"type": "header", "text": _plain_text(MESSAGE)},
            {
                "type": "section",
                "fields": [
                    _plain_text(f"문의 유형\n{category}"),
                    _plain_text(f"이메일\n{email}"),
                ],
            },
            {
                "type": "section",
                "text": _plain_text(f"문의 내용\n{content}"),
            },
        ],
    }


def _is_slack_webhook_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and hostname == "hooks.slack.com"
        and parsed.path.startswith("/services/")
        and not parsed.username
        and not parsed.password
    )


def notify_new_inquiry(
    category: str,
    email: str,
    content: str,
    *,
    webhook_url: str | None = None,
    opener=urllib.request.urlopen,
) -> bool:
    """알림을 보냈으면 True, 주소가 없거나 실패했으면 False를 반환한다."""
    url = webhook_url if webhook_url is not None else os.getenv("INQUIRY_WEBHOOK_URL", "")
    if not url:
        return False
    if not _is_slack_webhook_url(url):
        LOGGER.error("문의 알림 설정이 올바른 Slack Incoming Webhook 주소가 아닙니다.")
        return False

    try:
        request = urllib.request.Request(
            url,
            data=json.dumps(
                build_payload(category=category, email=email, content=content),
                ensure_ascii=False,
            ).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "where-you-at-inquiry-notifier/1.0",
            },
            method="POST",
        )
        with opener(request, timeout=TIMEOUT_SECONDS):
            pass
        return True
    except Exception as exc:
        # urllib 예외 문자열에는 웹훅 URL이 들어갈 수 있어 예외 종류만 기록한다.
        LOGGER.error("문의 알림 전송 실패 (%s)", type(exc).__name__)
        return False
