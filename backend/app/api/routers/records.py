from fastapi import APIRouter, Depends, HTTPException

from ...crud import record as crud
from ...deps import CurrentUser, db_connection, get_current_user, require_record_features
from ...schemas.record import RunRecordCreate, RunRecordListResponse, RunRecordOut

router = APIRouter(prefix="/api/records", tags=["records"], dependencies=[Depends(require_record_features)])


@router.post("", response_model=RunRecordOut, status_code=201)
def create_record(body: RunRecordCreate, current_user: CurrentUser = Depends(get_current_user)):
    """따라가기 완주 기록을 저장한다."""
    with db_connection() as conn:
        row = crud.create_record(
            conn,
            user_id=current_user.id,
            course_id=body.course_id,
            route_type=body.route_type,
            distance_km=body.distance_km,
            duration_ms=body.duration_ms,
            pace_sec_per_km=body.pace_sec_per_km,
            finished_at=body.finished_at,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return row


@router.get("", response_model=RunRecordListResponse)
def list_records(current_user: CurrentUser = Depends(get_current_user)):
    """내 완주 기록을 최근 순으로 돌려준다."""
    with db_connection() as conn:
        total, rows = crud.list_records(conn, user_id=current_user.id)
    return {"total_count": total, "records": rows}
