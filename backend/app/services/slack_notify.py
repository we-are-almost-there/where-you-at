"""Slack Incoming Webhook 전송을 맡는다. 무엇을 보낼지는 부르는 쪽이 정한다.

운영팀 전용 비공개 채널 하나를 새 문의 알림과 운영 알림이 함께 쓴다(INQUIRY_WEBHOOK_URL).
개인정보가 들어가는 메시지는 개인정보처리방침 7·8번의 범위 안이어야 한다.
"""

import json
import logging
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from app.core.config import settings

LOGGER = logging.getLogger(__name__)
TIMEOUT_SECONDS = 3
UNLINK_FAILURE_MESSAGE = "[어디까지왔니] 연결 끊기 웹훅 처리 실패, Render 로그 확인 필요"


def plain_text(text: str) -> dict[str, str]:
    # 이용자가 입력한 Slack 마크업이나 멘션이 실행되지 않게 모든 입력을 plain_text로 보낸다.
    return {"type": "plain_text", "text": text}


def notify_unlink_failure() -> bool:
    """연결 끊기 웹훅을 받고도 회원을 지우지 못했음을 알린다(삭제 실패, 회원번호 없음).

    카카오는 연결 해제 웹훅을 다시 보내지 않고 Render 로그는 7일만 남으므로, 이 알림이 없으면
    회원 정보가 모르는 사이 계속 남는다. 무엇이 실패했는지와 어느 회원인지는 Render 로그로만
    확인한다. Slack 전송 항목에 회원번호를 더하면 개인정보처리방침 7·8번을 함께 고쳐야 한다.
    """
    return post(
        settings.inquiry_webhook_url,
        {"text": UNLINK_FAILURE_MESSAGE},
        failure_log="연결 끊기 웹훅 삭제 실패 알림 전송 실패",
    )


def is_webhook_url(url: str) -> bool:
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


def post(url: str, payload: dict[str, object], *, failure_log: str) -> bool:
    """알림을 보냈으면 True, 주소가 없거나 실패했으면 False를 반환한다.

    failure_log는 실패할 때 남길 문구다. 비밀인 Webhook 주소가 새지 않도록 URL과 예외 문자열은
    남기지 않고, 비밀이 아닌 HTTP 상태만 덧붙인다.
    """
    if not url:
        return False
    if not is_webhook_url(url):
        LOGGER.error("%s (올바른 Slack Incoming Webhook 주소가 아님)", failure_log)
        return False

    try:
        request = Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "where-you-at-inquiry-notifier/1.0",
            },
            method="POST",
        )
        # urllib는 요청 URL을 INFO 로그로 남기지 않아 비밀인 Webhook 경로가 로그에 노출되지 않는다.
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            # Slack Incoming Webhook은 성공하면 본문으로 "ok"만 돌려준다. 형식이 틀린 주소는 api.slack.com 문서로
            # 리다이렉트돼 200이 오므로, 상태 코드만 보면 알림이 끊겨도 성공으로 처리된다.
            if response.read(16) != b"ok":
                LOGGER.error("%s (Slack 응답이 ok가 아님, 웹훅 주소 확인 필요)", failure_log)
                return False
        return True
    except Exception as exc:
        status_code = getattr(exc, "code", "")
        if status_code:
            LOGGER.error("%s (%s %s)", failure_log, type(exc).__name__, status_code)
        else:
            LOGGER.error("%s (%s)", failure_log, type(exc).__name__)
        return False
