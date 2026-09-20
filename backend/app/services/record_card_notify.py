"""Slack으로 기록 카드 커밋 확인 실패를 알린다.

record_cards.py의 _card_was_committed()가 예외 발생 후 재확인용 연결마저 실패했을 때 부른다.
이 경우 이미지를 지우지 않고 그대로 두므로(잘못 지우는 것보다 안전), 운영팀이 R2와 DB를 직접 대조해야 한다.

카카오 연결 끊기 웹훅 실패 알림(auth.py)과 같은 이유로 회원 번호·이미지 키는 넣지 않는다. Slack 전송
항목에 더하면 개인정보처리방침 7·8번을 함께 고쳐야 한다. 대신 Render 로그에서 회원 번호와 이미지 키를
확인한다(README "기록 카드 커밋 확인 실패").

INQUIRY_WEBHOOK_URL이 비어 있으면 아무것도 하지 않는다. 알림 전송 실패는 원래 요청 처리(원래 예외를
그대로 올리는 것)에 영향을 주지 않는다.
"""

from app.core.config import settings
from app.services import slack_notify

MESSAGE = "[어디까지왔니] 기록 카드 커밋 확인 실패, Render 로그 확인 필요"


def build_payload() -> dict[str, object]:
    return {
        "text": MESSAGE,
        "blocks": [{"type": "header", "text": slack_notify.plain_text(MESSAGE)}],
    }


def notify_reconciliation_failure(*, webhook_url: str | None = None) -> bool:
    """알림을 보냈으면 True, 주소가 없거나 실패했으면 False를 반환한다."""
    url = webhook_url if webhook_url is not None else settings.inquiry_webhook_url
    return slack_notify.post(url, build_payload(), failure_log="기록 카드 커밋 확인 실패 알림 전송 실패")
