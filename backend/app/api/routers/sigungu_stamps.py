from fastapi import APIRouter, Depends, HTTPException, Response

from ...crud import sigungu_stamp as crud
from ...deps import CurrentUser, db_connection, get_current_user, require_record_features
from ...schemas.sigungu_stamp import SigunguStampCreated, SigunguStampOut
from ...sigungu_codes import SIGUNGU_CODES

router = APIRouter(
    prefix="/api/me/sigungu-stamps", tags=["sigungu-stamps"], dependencies=[Depends(require_record_features)]
)


@router.get("", response_model=list[SigunguStampOut])
def list_stamps(current_user: CurrentUser = Depends(get_current_user)):
    """스탬프 지도 전체 시군구의 현재 상태를 돌려준다."""
    with db_connection() as conn:
        return crud.list_stamps(conn, user_id=current_user.id)


@router.post("/{sigungu_code}", response_model=SigunguStampCreated, status_code=201)
def create_stamp(
    sigungu_code: str, response: Response, current_user: CurrentUser = Depends(get_current_user)
):
    """내 완주 기록이 있는 시군구에 스탬프를 찍는다."""
    if sigungu_code not in SIGUNGU_CODES:
        raise HTTPException(404, "Stamp region not found")
    with db_connection() as conn:
        row, created, status = crud.create_stamp(conn, user_id=current_user.id, code=sigungu_code)
    if status == 404:
        raise HTTPException(404, "Stamp region not found")
    if status == 409:
        raise HTTPException(409, "Complete a course in this region before stamping")
    response.status_code = status
    return {**row, "status": "STAMPED", "created": created}
