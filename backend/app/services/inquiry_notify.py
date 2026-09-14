"""
새 1:1 문의 알림 (Discord·Slack 수신 웹훅)

INQUIRY_WEBHOOK_URL이 비어 있으면 아무것도 하지 않는다. 알림은 문의 저장이 끝난 뒤 백그라운드로 보내므로
실패해도 문의 접수에는 영향이 없고, 실패 사유만 로그에 남긴다.

알림에는 새 문의가 들어왔다는 사실과 문의 유형만 담는다. Discord·Slack은 개인정보처리방침의 수탁자가 아니라서,
이메일·내용은 물론 문의 번호·접수 시각처럼 DB의 행과 이어 볼 수 있는 값도 넣지 않는다.
문의는 콘솔의 inquiry 테이블에서 확인한다. 담는 항목을 바꾸면 개인정보처리방침 7번 아래 문단도 함께 고친다.
"""

import json
import os
import urllib.request
from urllib.parse import urlparse

TIMEOUT_SECONDS = 5


def build_payload(webhook_url: str, category: str) -> dict:
    text = (
        f"새 1:1 문의가 접수됐어요 (유형: {category})\n"
        "이메일과 내용은 Supabase의 inquiry 테이블에서 확인해 주세요."
    )
    # Slack 수신 웹훅은 text, Discord는 content를 읽는다. 주소로 구분한다.
    host = urlparse(webhook_url).hostname or ""
    if host == "hooks.slack.com" or host.endswith(".slack.com"):
        return {"text": text}
    return {"content": text}


def notify_new_inquiry(
    category: str,
    *,
    webhook_url: str | None = None,
    opener=urllib.request.urlopen,
) -> bool:
    """알림을 보냈으면 True, 주소가 없거나 실패했으면 False. 예외는 올리지 않는다."""
    url = webhook_url if webhook_url is not None else os.getenv("INQUIRY_WEBHOOK_URL", "")
    if not url:
        return False

    payload = build_payload(url, category)
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            # 기본 User-Agent(Python-urllib)는 Discord 앞단에서 거부되는 경우가 있어 따로 적는다.
            "User-Agent": "where-you-at-inquiry-notifier/1.0",
        },
        method="POST",
    )
    try:
        with opener(request, timeout=TIMEOUT_SECONDS):
            pass
        return True
    except Exception as e:
        print(f"[ERROR] 문의 알림 전송 실패: {e}")
        return False
