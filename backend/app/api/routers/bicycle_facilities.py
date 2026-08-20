from fastapi import APIRouter, HTTPException, Query

from app.crud.bicycle_facility import (
    get_bicycle_facility_by_id,
    list_bicycle_facilities,
    list_bicycle_regions,
    list_bicycle_sigungu,
)
from app.db.supabase import get_db_connection
from app.schemas.bicycle_facility import (
    BicycleFacilityListResponse,
    BicycleRegionOption,
    BicycleSigunguOption,
)


router = APIRouter(
    prefix="/api/bicycle-facilities",
    tags=["bicycle-facilities"],
)


@router.get("", response_model=BicycleFacilityListResponse)
def list_facilities(
    region: str | None = Query(None, pattern=r"^\d{2}(\d{3})?$"),
    facility_type: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """자전거 대여소/정비소 목록을 조회한다."""
    conn = get_db_connection()

    if not conn:
        raise HTTPException(status_code=503, detail="DB 연결 실패")

    try:
        total, rows = list_bicycle_facilities(
            conn, region=region, facility_type=facility_type, page=page, size=size
        )
        return {"total_count": total, "page": page, "size": size, "facilities": rows}
    finally:
        conn.close()


@router.get("/regions/{sido_code}/sigungu", response_model=list[BicycleSigunguOption])
def get_bicycle_sigungu(sido_code: str):
    """특정 시/도 내 자전거 시설 보유 시/군/구 목록."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=503, detail="DB 연결 실패")
    try:
        return list_bicycle_sigungu(conn, sido_code)
    finally:
        conn.close()


@router.get("/regions", response_model=list[BicycleRegionOption])
def get_bicycle_regions():
    """자전거 시설이 있는 시/도 목록. 지역 필터 드롭다운 데이터원."""
    conn = get_db_connection()

    if not conn:
        raise HTTPException(status_code=503, detail="DB 연결 실패")

    try:
        return list_bicycle_regions(conn)
    finally:
        conn.close()


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
