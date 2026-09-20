from fastapi import APIRouter, Depends, HTTPException, Query

from ...crud import record as crud
from ...deps import CurrentUser, db_connection, get_current_user
from ...schemas.record import (
    RecordCardCreate,
    RecordCardListResponse,
    RecordCardOut,
    RecordCardUploadRequest,
    RecordCardUploadResponse,
    RunRecordOut,
)
from ...services import storage
from ...services.rate_limit import SlidingWindowLimiter

router = APIRouter(prefix="/api/record-cards", tags=["record-cards"])

# 카드 이미지는 Canvas PNG라 보통 수백 KB다. 넉넉히 5MB까지만 받는다.
MAX_CARD_IMAGE_BYTES = 5 * 1024 * 1024

# 한 번에 받을 수 있는 카드 수의 상한. 카드마다 presigned URL을 발급하므로 크게 열지 않는다.
MAX_CARD_PAGE_SIZE = 50

# 회원별 10분에 업로드 URL 30회, 카드 생성 30회. 정상 사용(완주 뒤 카드 몇 장)의 몇 배로 넉넉히 잡았다.
# 메모리 기반이라 프로세스별로 센다(services/rate_limit.py 참고). 현재 배포는 인스턴스 1개, 워커 1개다.
upload_url_limiter = SlidingWindowLimiter(max_requests=30, window_seconds=600)
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


def _discard_promoted_image(image_key: str) -> None:
    """DB에 카드를 남기지 못한 최종 이미지를 지운다. 실패해도 원래 오류를 가리지 않게 로그만 남긴다."""
    try:
        storage.delete(image_key)
    except storage.StorageError as e:
        print(f"[ERROR] 고아 기록 카드 이미지 삭제 실패(직접 삭제 필요): {image_key} {e}")


@router.post("/upload-url", response_model=RecordCardUploadResponse)
def create_upload_url(body: RecordCardUploadRequest, current_user: CurrentUser = Depends(get_current_user)):
    """카드 이미지를 올릴 임시 URL을 발급한다. 브라우저가 이 URL로 PUT(같은 Content-Type)한다."""
    _require_storage()
    if not upload_url_limiter.allow(str(current_user.id)):
        raise HTTPException(status_code=429, detail="요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.")
    with db_connection() as conn:
        if crud.count_cards(conn, user_id=current_user.id) >= crud.MAX_CARDS_PER_USER:
            raise HTTPException(status_code=409, detail="저장할 수 있는 기록 카드 수를 넘었어요.")
    try:
        upload_key = storage.new_key(storage.Folder.UPLOAD, current_user.id, body.content_type)
        upload_url = storage.presign_upload(upload_key, body.content_type)
    except storage.StorageError as e:
        print(f"[ERROR] 기록 카드 업로드 URL 발급 실패: {e}")
        raise HTTPException(status_code=502, detail="이미지 업로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    return {"upload_key": upload_key, "upload_url": upload_url}


@router.post("", response_model=RecordCardOut, status_code=201)
def create_card(body: RecordCardCreate, current_user: CurrentUser = Depends(get_current_user)):
    """올라간 이미지를 검증하고 최종 폴더로 옮긴 뒤 기록 카드로 저장한다."""
    _require_storage()
    if not create_card_limiter.allow(str(current_user.id)):
        raise HTTPException(status_code=429, detail="요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.")
    # 남의 임시 키로 카드를 만들지 못하게 내 폴더의 키만 받는다.
    if not body.upload_key.startswith(f"{storage.Folder.UPLOAD.value}/{current_user.id}/"):
        raise HTTPException(status_code=400, detail="올바르지 않은 업로드 키입니다.")

    # 내 기록인지 먼저 확인해, 남의 기록에 붙이려는 요청이 R2 작업까지 가지 않게 한다.
    with db_connection() as conn:
        if not crud.record_exists(conn, user_id=current_user.id, record_id=body.record_id):
            raise HTTPException(status_code=404, detail="Record not found")

    try:
        info = storage.head(body.upload_key)
        if info is None:
            raise HTTPException(status_code=400, detail="업로드된 이미지를 찾을 수 없습니다.")
        if info.content_type not in storage.IMAGE_EXTENSIONS or info.size > MAX_CARD_IMAGE_BYTES:
            storage.delete(body.upload_key)
            raise HTTPException(status_code=400, detail="이미지 형식이나 크기가 올바르지 않습니다.")
        image_key = storage.promote(body.upload_key, storage.Folder.RECORD_CARD, info)
    except storage.UploadChangedError:
        raise HTTPException(status_code=409, detail="업로드한 이미지가 바뀌었습니다. 다시 시도해 주세요.")
    except storage.StorageError as e:
        print(f"[ERROR] 기록 카드 이미지 처리 실패: {e}")
        raise HTTPException(status_code=502, detail="이미지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")

    try:
        with db_connection() as conn:
            row = crud.create_card(
                conn, user_id=current_user.id, record_id=body.record_id, image_key=image_key
            )
    except BaseException:
        # 연결 실패(503), insert·commit 예외 모두 카드 행이 없으니 옮겨 둔 이미지를 지우고 원래 오류를 그대로 올린다.
        _discard_promoted_image(image_key)
        raise
    if row == crud.CARD_QUOTA_EXCEEDED:
        _discard_promoted_image(image_key)
        raise HTTPException(status_code=409, detail="저장할 수 있는 기록 카드 수를 넘었어요.")
    if row is None:
        # 확인과 저장 사이에 기록이 지워진 드문 경우.
        _discard_promoted_image(image_key)
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
