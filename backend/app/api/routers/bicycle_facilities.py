from fastapi import APIRouter, HTTPException, Query

from app.crud.bicycle_facility import (
    get_bicycle_facility_by_id,
    list_bicycle_facilities,
    list_bicycle_regions,
    list_bicycle_subregions,
)
from app.db.supabase import get_db_connection
from app.schemas.bicycle_facility import (
    BicycleFacilityListResponse,
    BicycleRegionOption,
    BicycleSubregionOption,
    BicycleFacilitySummary,
)


router = APIRouter(
    prefix="/api/bicycle-facilities",
    tags=["bicycle-facilities"],
)


@router.get("", response_model=BicycleFacilityListResponse)
def list_facilities(
    region: str | None = Query(None, pattern=r"^\d{2}(\d{2,3})?$"),
    facility_type: str | None = None,
    fee_type: str | None = Query(None, pattern="^(무료|유료)$"),
    data_source: str | None = Query(None, pattern="^(standard|realtime)$"),
    sort: str | None = Query(None, pattern="^nearest$"),
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """자전거 대여소/정비소 목록을 조회한다."""
    conn = get_db_connection()

    if not conn:
        raise HTTPException(status_code=503, detail="DB 연결 실패")

    try:
        total, rows = list_bicycle_facilities(
            conn,
            region=region,
            facility_type=facility_type,
            fee_type=fee_type,
            data_source=data_source,
            sort=sort,
            lat=lat,
            lng=lng,
            page=page,
            size=size,
        )
        return {"total_count": total, "page": page, "size": size, "facilities": rows}
    finally:
        conn.close()


@router.get("/regions", response_model=list[BicycleRegionOption])
def get_bicycle_regions(data_source: str | None = Query(None, pattern="^(standard|realtime)$")):
    """자전거 시설이 있는 지역(시/도+시/군/구) 전체 목록. 지역 필터 드롭다운 데이터원."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=503, detail="DB 연결 실패")
    try:
        return list_bicycle_regions(conn, data_source=data_source)
    finally:
        conn.close()


@router.get("/regions/{parent_code}/subregions", response_model=list[BicycleSubregionOption])
def get_bicycle_subregions(
    parent_code: str,
    data_source: str | None = Query(None, pattern="^(standard|realtime)$"),
):
    """특정 상위 지역(시/도 또는 시/군) 안의 하위 구 목록. 개수는 현재 탭 기준."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=503, detail="DB 연결 실패")
    try:
        return list_bicycle_subregions(conn, parent_code, data_source=data_source)
    finally:
        conn.close()


@router.get("/{id}", response_model=BicycleFacilitySummary)
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
