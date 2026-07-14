from fastapi import APIRouter, Depends, Query

from ...deps import get_db
from ...crud import nearby as crud
from ...schemas.nearby import NearbyListResponse

router = APIRouter(prefix="/api/courses", tags=["nearby"])


@router.get("/{id}/nearby", response_model=NearbyListResponse)
def get_course_nearby(
    id: int,
    category: str = Query(..., pattern="^(attraction|restaurant|accommodation)$"),
    route_type: str = Query("trail", pattern="^(trail|bicycle)$"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    conn=Depends(get_db),
):
    total, spots = crud.list_nearby_spots(conn, id, category, route_type, page, size)
    return {"total_count": total, "spots": spots}