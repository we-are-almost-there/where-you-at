from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.concurrency import run_in_threadpool

from ...crud import record as crud
from ...deps import CurrentUser, db_connection, get_current_user, require_record_features
from ...schemas.record import (
    RecordCardListResponse,
    RecordCardOut,
    RunRecordOut,
)
from ...services import storage, record_card_notify
from ...services.rate_limit import SlidingWindowLimiter

router = APIRouter(prefix="/api/record-cards", tags=["record-cards"], dependencies=[Depends(require_record_features)])

# 카드 이미지는 Canvas PNG라 보통 수백 KB다. 넉넉히 5MB까지만 받는다.
MAX_CARD_IMAGE_BYTES = 5 * 1024 * 1024

# 한 번에 받을 수 있는 카드 수의 상한. 카드마다 presigned URL을 발급하므로 크게 열지 않는다.
MAX_CARD_PAGE_SIZE = 50

# 회원별 10분에 카드 생성 30회. 정상 사용(완주 뒤 카드 몇 장)의 몇 배로 넉넉히 잡았다.
# 메모리 기반이라 프로세스별로 센다(services/rate_limit.py 참고). 현재 배포는 인스턴스 1개, 워커 1개다.
create_card_limiter = SlidingWindowLimiter(max_requests=30, window_seconds=600)


def _require_storage() -> None:
    if not storage.is_configured():
        print("[ERROR] R2 설정이 비어 있어 기록 카드를 처리할 수 없습니다.")
        raise HTTPException(status_code=503, detail="지금은 기록 카드를 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.")


def _to_card_out(row: dict) -> RecordCardOut:
    """crud의 평평한 행을 중첩 record가 있는 응답으로 만든다."""
    try:
        image_url = storage.presign_download(row["image_key"])
    except storage.StorageError as e:
        # 이미지 URL만 못 만든 것이므로 목록 전체를 실패시키지 않는다. 프론트가 기본 카드로 대체한다.
        print(f"[ERROR] 기록 카드 보기 URL 발급 실패: {e}")
        image_url = None
    return RecordCardOut(
        id=row["card_id"],
        record=RunRecordOut(
            id=row["id"],
            course_id=row["course_id"],
            course_name=row["course_name"],
            route_type=row["route_type"],
            distance_km=row["distance_km"],
            duration_ms=row["duration_ms"],
            pace_sec_per_km=row["pace_sec_per_km"],
            finished_at=row["finished_at"],
        ),
        image_url=image_url,
        created_at=row["card_created_at"],
    )


def _discard_card_image(image_key: str) -> None:
    """DB에 카드를 남기지 못한 최종 이미지를 지운다. 실패해도 원래 오류를 가리지 않게 로그만 남긴다."""
    try:
        storage.delete(image_key)
    except storage.StorageError as e:
        print(f"[ERROR] 고아 기록 카드 이미지 삭제 실패(직접 삭제 필요): {image_key} {e}")


def _card_was_committed(*, user_id: int, image_key: str) -> bool | None:
    """저장 중 예외가 난 뒤, 실제로 커밋됐는지 새 연결로 다시 확인한다.

    커밋이 확인되면(True) 이미지를 지우면 안 된다 — DB 행이 그 이미지를 가리키고 있다.
    확인 자체가 실패하면(None) 커밋 여부를 알 수 없으므로, 아직 참조 중일 가능성을 감안해
    지우지 않는 쪽으로 두고 Slack으로 알려 운영팀이 직접 확인하게 한다. Slack 메시지에는
    회원 번호·이미지 키를 넣지 않는다(record_card_notify.py 참고). Render 로그에만 남긴다.
    확실히 커밋 안 됐을 때만(False) 지운다.
    """
    try:
        with db_connection() as conn:
            return crud.card_exists_with_image(conn, user_id=user_id, image_key=image_key)
    except Exception as e:
        print(f"[ERROR] 기록 카드 커밋 확인 실패(직접 확인 필요): user_id={user_id} image_key={image_key} {e}")
        record_card_notify.notify_reconciliation_failure()
        return None


async def _card_body(request: Request) -> bytes:
    """Content-Length가 없거나 틀려도 실제 수신 바이트를 제한한다."""
    length = request.headers.get("content-length")
    if length is not None:
        try:
            size = int(length)
        except ValueError:
            raise HTTPException(status_code=400, detail="올바르지 않은 파일 크기입니다.")
        if size < 0:
            raise HTTPException(status_code=400, detail="올바르지 않은 파일 크기입니다.")
        if size > MAX_CARD_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="기록 카드 이미지는 5MB 이하만 올릴 수 있습니다.")
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_CARD_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="기록 카드 이미지는 5MB 이하만 올릴 수 있습니다.")
        data.extend(chunk)
    if not data:
        raise HTTPException(status_code=400, detail="빈 파일은 올릴 수 없습니다.")
    return bytes(data)


@router.post("", response_model=RecordCardOut, status_code=201)
async def create_card(
    request: Request,
    record_id: int = Query(..., gt=0),
    current_user: CurrentUser = Depends(get_current_user),
):
    """이미지 본문을 받아 검증한 뒤 저장한다. record_id는 쿼리로 전달한다."""
    _require_storage()
    if not create_card_limiter.allow(str(current_user.id)):
        raise HTTPException(status_code=429, detail="요청이 너무 많아요. 잠시 후 다시 시도해 주세요.")
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type not in storage.IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="JPG, PNG, WEBP 이미지만 올릴 수 있습니다.")
    data = await _card_body(request)
    return await run_in_threadpool(_store_card, record_id, current_user, data, content_type)


def _store_card(record_id: int, current_user: CurrentUser, data: bytes, content_type: str):
    with db_connection() as conn:
        if not crud.record_exists(conn, user_id=current_user.id, record_id=record_id):
            raise HTTPException(status_code=404, detail="Record not found")
        if crud.count_cards(conn, user_id=current_user.id) >= crud.MAX_CARDS_PER_USER:
            raise HTTPException(status_code=409, detail="저장할 수 있는 기록 카드 수를 넘었어요.")

    detected_type = storage.decoded_card_content_type(data)
    if detected_type is None or detected_type != content_type:
        raise HTTPException(status_code=400, detail="이미지 형식이나 해상도가 올바르지 않습니다.")
    image_key = storage.new_key(storage.Folder.RECORD_CARD, current_user.id, detected_type)
    try:
        storage.put(image_key, data, detected_type)
    except storage.StorageError as e:
        # 타임아웃이어도 원격 저장은 완료됐을 수 있다.
        _discard_card_image(image_key)
        print(f"[ERROR] 기록 카드 이미지 저장 실패: {e}")
        raise HTTPException(status_code=502, detail="이미지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")

    try:
        with db_connection() as conn:
            row = crud.create_card(
                conn, user_id=current_user.id, record_id=record_id, image_key=image_key
            )
    except Exception:
        # 연결 실패나 insert 도중 예외는 대부분 커밋 전이라 이미지를 지워도 안전하다.
        # 다만 commit() 자체가 응답 직전에 끊긴 경우처럼 실제로는 커밋됐을 수 있어,
        # 확실히 "커밋 안 됨"으로 확인될 때만 지운다.
        if _card_was_committed(user_id=current_user.id, image_key=image_key) is False:
            _discard_card_image(image_key)
        raise
    if row == crud.CARD_QUOTA_EXCEEDED:
        _discard_card_image(image_key)
        raise HTTPException(status_code=409, detail="저장할 수 있는 기록 카드 수를 넘었어요.")
    if row is None:
        # 확인과 저장 사이에 기록이 지워진 드문 경우.
        _discard_card_image(image_key)
        raise HTTPException(status_code=404, detail="Record not found")
    return _to_card_out(row)


@router.get("", response_model=RecordCardListResponse)
def list_cards(
    page: int = Query(1, ge=1),
    size: int = Query(12, ge=1, le=MAX_CARD_PAGE_SIZE),
    current_user: CurrentUser = Depends(get_current_user),
):
    """내 기록 카드를 최근 순으로 한 쪽만 돌려준다. 이미지 URL은 이 쪽의 카드에만 발급한다."""
    with db_connection() as conn:
        total, rows = crud.list_cards(conn, user_id=current_user.id, page=page, size=size)
    return {"total_count": total, "page": page, "size": size, "cards": [_to_card_out(row) for row in rows]}
