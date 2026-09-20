"""Slack으로 기록 카드 커밋 확인 실패를 알린다.

record_cards.py의 _card_was_committed()가 예외 발생 후 재확인용 연결마저 실패했을 때 부른다.
이 경우 이미지를 지우지 않고 그대로 두므로(잘못 지우는 것보다 안전), 운영팀이 R2와 DB를 직접 대조해야 한다.

INQUIRY_WEBHOOK_URL이 비어 있으면 아무것도 하지 않는다. 알림 전송 실패는 원래 요청 처리(원래 예외를
그대로 올리는 것)에 영향을 주지 않는다.
"""

from app.core.config import settings
from app.services import slack_notify

MESSAGE = "[어디까지왔니] 기록 카드 커밋 확인 실패 — 수동 확인 필요"


def build_payload(*, user_id: int, image_key: str) -> dict[str, object]:
    return {
        "text": MESSAGE,
        "blocks": [
            {"type": "header", "text": slack_notify.plain_text(MESSAGE)},
            {
                "type": "section",
                "fields": [
                    slack_notify.plain_text(f"회원 번호\n{user_id}"),
                    slack_notify.plain_text(f"이미지 키\n{image_key}"),
                ],
            },
            {
                "type": "section",
                "text": slack_notify.plain_text(
                    "기록 카드 저장 중 예외가 났고, 실제로 커밋됐는지 재확인도 실패했습니다.\n"
                    "R2에서 위 이미지 키를 찾아 record_card 테이블에 대응하는 행이 있는지 확인해 주세요.\n"
                    "행이 없으면 이미지를 지우고, 행이 있으면 그대로 둡니다."
                ),
            },
        ],
    }


def notify_reconciliation_failure(
    *,
    user_id: int,
    image_key: str,
    webhook_url: str | None = None,
) -> bool:
    """알림을 보냈으면 True, 주소가 없거나 실패했으면 False를 반환한다."""
    url = webhook_url if webhook_url is not None else settings.inquiry_webhook_url
    return slack_notify.post(
        url,
        build_payload(user_id=user_id, image_key=image_key),
        failure_log="기록 카드 커밋 확인 실패 알림 전송 실패",
    )
