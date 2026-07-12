from fastapi import APIRouter, HTTPException, Query

from app.crud.tour_spot import (
    DETAIL_TABLE_MAP,
    get_tour_spot_by_id,
    get_tour_spots,
)
from app.db.supabase import get_db_connection


router = APIRouter(
    prefix="/api/tour-spots",
    tags=["tour-spots"],
)


@router.get("")
def list_tour_spots(
    content_type_id: str | None = Query(None),
    region_code: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """관광정보 목록을 조회한다."""

    if content_type_id and content_type_id not in DETAIL_TABLE_MAP:
        raise HTTPException(
            status_code=422,
            detail=f"유효하지 않은 content_type_id: {content_type_id}",
        )

    conn = get_db_connection()

    if not conn:
        raise HTTPException(
            status_code=503,
            detail="DB 연결 실패",
        )

    try:
        total, items = get_tour_spots(
            conn=conn,
            content_type_id=content_type_id,
            region_code=region_code,
            limit=limit,
            offset=offset,
        )

        return {
            "total": total,
            "items": items,
        }

    finally:
        conn.close()


@router.get("/{content_id}")
def retrieve_tour_spot(content_id: str):
    """관광정보와 유형별 상세정보를 조회한다."""

    conn = get_db_connection()

    if not conn:
        raise HTTPException(
            status_code=503,
            detail="DB 연결 실패",
        )

    try:
        spot = get_tour_spot_by_id(
            conn=conn,
            content_id=content_id,
        )

        if not spot:
            raise HTTPException(
                status_code=404,
                detail="관광지를 찾을 수 없습니다.",
            )

        return spot

    finally:
        conn.close()
