from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.crud.bicycle_facility import (
    get_bicycle_facility_by_id,
    list_bicycle_facilities,
    list_bicycle_regions,
    list_bicycle_subregions,
)
from app.deps import get_db
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
    facility_type: str | None = Query(None, pattern="^(rental_staffed|rental_unmanned|rental_mixed)$"),
    fee_type: str | None = Query(None, pattern="^(무료|유료)$"),
    data_source: str | None = Query(None, pattern="^(standard|realtime)$"),
    page: int = Query(1, ge=1),
    # 이용자 위치를 서버로 받지 않으므로 '가까운 순'은 브라우저가 전체 목록을 받아 정렬한다.
    # 그래서 한 탭의 시설을 한 번에 받을 수 있게 상한을 프론트 요청 크기와 같은 5,000으로 둔다(실시간 탭 약 4,800건).
    # 넘치면 프론트가 페이지를 넘기며 모은다. 인증 없는 공개 API라 필요 이상으로 크게 열지 않는다.
    size: int = Query(20, ge=1, le=5000),
    conn=Depends(get_db),
):
    """자전거 대여소/정비소 목록을 조회한다. 정렬은 bicycle_id 고정."""
    total, rows = list_bicycle_facilities(
        conn,
        region=region,
        facility_type=facility_type,
        fee_type=fee_type,
        data_source=data_source,
        page=page,
        size=size,
    )
    return {"total_count": total, "page": page, "size": size, "facilities": rows}


@router.get("/regions", response_model=list[BicycleRegionOption])
def get_bicycle_regions(
    data_source: str | None = Query(None, pattern="^(standard|realtime)$"),
    conn=Depends(get_db),
):
    """자전거 시설이 있는 지역(시/도+시/군/구) 전체 목록. 지역 필터 드롭다운 데이터원."""
    return list_bicycle_regions(conn, data_source=data_source)


@router.get("/regions/{parent_code}/subregions", response_model=list[BicycleSubregionOption])
def get_bicycle_subregions(
    parent_code: str = Path(..., pattern=r"^\d{2}(\d{2,3})?$"),
    data_source: str | None = Query(None, pattern="^(standard|realtime)$"),
    conn=Depends(get_db),
):
    """특정 상위 지역(시/도 또는 시/군) 안의 하위 구 목록. 개수는 현재 탭 기준."""
    return list_bicycle_subregions(conn, parent_code, data_source=data_source)


@router.get("/{id}", response_model=BicycleFacilitySummary)
def retrieve_bicycle_facility(id: int, conn=Depends(get_db)):
    """자전거 대여소/정비소 상세정보를 조회한다."""
    facility = get_bicycle_facility_by_id(conn=conn, bicycle_id=id)

    if not facility:
        raise HTTPException(status_code=404, detail="자전거 시설을 찾을 수 없습니다.")

    return facility
