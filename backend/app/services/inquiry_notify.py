"""
새 1:1 문의 알림 (Discord·Slack 수신 웹훅)

INQUIRY_WEBHOOK_URL이 비어 있으면 아무것도 하지 않는다. 알림은 문의 저장이 끝난 뒤 백그라운드로 보내므로
실패해도 문의 접수에는 영향이 없고, 실패 사유만 로그에 남긴다.

알림에는 문의 번호·유형·접수 시각만 담는다. 이메일과 문의 내용은 채팅방에 쌓이면 개인정보가
Supabase 밖으로 복제되는 셈이라 넣지 않고, 콘솔의 inquiry 테이블에서 확인하게 한다.
"""

import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

KST = timezone(timedelta(hours=9))
TIMEOUT_SECONDS = 5


def build_payload(webhook_url: str, inquiry_id: int, category: str, received_at: datetime) -> dict:
    received = received_at.astimezone(KST).strftime("%Y-%m-%d %H:%M")
    text = (
        f"새 1:1 문의가 접수됐어요 (#{inquiry_id} · {category} · {received} KST)\n"
        "이메일과 내용은 Supabase의 inquiry 테이블에서 확인해 주세요."
    )
    # Slack 수신 웹훅은 text, Discord는 content를 읽는다. 주소로 구분한다.
    host = urlparse(webhook_url).hostname or ""
    if host == "hooks.slack.com" or host.endswith(".slack.com"):
        return {"text": text}
    return {"content": text}


def notify_new_inquiry(
    inquiry_id: int,
    category: str,
    *,
    received_at: datetime,
    webhook_url: str | None = None,
    opener=urllib.request.urlopen,
) -> bool:
    """알림을 보냈으면 True, 주소가 없거나 실패했으면 False. 예외는 올리지 않는다."""
    url = webhook_url if webhook_url is not None else os.getenv("INQUIRY_WEBHOOK_URL", "")
    if not url:
        return False

    payload = build_payload(url, inquiry_id, category, received_at)
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
        print(f"[ERROR] 문의 알림 전송 실패 (#{inquiry_id}): {e}")
        return False
