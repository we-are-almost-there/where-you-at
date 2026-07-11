from fastapi import APIRouter, Depends

from ...deps import get_db
from ...crud import region as crud
from ...schemas.region import RegionOut

router = APIRouter(prefix="/api/regions", tags=["regions"])


@router.get("", response_model=list[RegionOut])
def get_regions(sido: str | None = None, conn=Depends(get_db)):
    """코스를 보유한 지역 목록. 프론트 지역 필터 드롭다운 데이터원.
    sido(시도명) 지정 시 해당 시도로 필터. 코스 없는 시군구는 반환하지 않는다.
    """
    return crud.list_regions_with_courses(conn, sido=sido)
