from fastapi import APIRouter, HTTPException

from app.crud.bicycle_facility import get_bicycle_facility_by_id
from app.db.supabase import get_db_connection


router = APIRouter(
    prefix="/api/bicycle-facilities",
    tags=["bicycle-facilities"],
)


@router.get("/{id}")
def retrieve_bicycle_facility(id: int):
    """자전거 대여소/정비소 상세정보를 조회한다."""

    conn = get_db_connection()

    if not conn:
        raise HTTPException(
            status_code=503,
            detail="DB 연결 실패",
        )

    try:
        facility = get_bicycle_facility_by_id(
            conn=conn,
            bicycle_id=id,
        )

        if not facility:
            raise HTTPException(
                status_code=404,
                detail="자전거 시설을 찾을 수 없습니다.",
            )

        return facility

    finally:
        conn.close()