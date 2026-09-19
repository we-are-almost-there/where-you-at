from typing import Literal

from fastapi import APIRouter, Depends

from ...deps import get_db
from ...crud import region as crud
from ...schemas.region import RegionOut

router = APIRouter(prefix="/api/regions", tags=["regions"])


@router.get("", response_model=list[RegionOut])
def get_regions(
    sido: str | None = None,
    type: Literal["trail", "bicycle"] | None = None,
    conn=Depends(get_db),
):
    """코스를 보유한 지역 목록. 프론트 지역 필터 드롭다운 데이터원.
    sido(시도명)나 type(경로 유형)을 주면 해당 조건으로 필터한다.
    코스 없는 시군구는 반환하지 않는다.
    """
    return crud.list_regions_with_courses(conn, sido=sido, route_type=type)
