from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ...crud import race as race_crud
from ...deps import get_db
from ...schemas.race import RaceDetailOut, RaceListResponse, RaceOut, NearbyAccommodationOut

router = APIRouter(prefix="/api/races", tags=["races"])


@router.get("", response_model=RaceListResponse)
def list_races(
    region_code: Optional[str] = Query(None, description="지역코드 (5자리)"),
    event_type: Optional[str] = Query(None, description="running | cycling"),
    upcoming_only: bool = Query(True, description="다가오는 대회만 조회"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    conn=Depends(get_db),
):
    rows, total = race_crud.get_races(
        conn,
        region_code=region_code,
        event_type=event_type,
        upcoming_only=upcoming_only,
        page=page,
        per_page=per_page,
    )
    return RaceListResponse(total=total, page=page, per_page=per_page, items=rows)


@router.get("/{event_id}", response_model=RaceDetailOut)
def get_race(event_id: int, conn=Depends(get_db)):
    row = race_crud.get_race_by_id(conn, event_id)
    if not row:
        raise HTTPException(status_code=404, detail="대회를 찾을 수 없습니다")
    return row


@router.get("/by-course/{course_id}", response_model=list[RaceOut])
def get_races_near_course(
    course_id: int,
    upcoming_only: bool = Query(True, description="다가오는 대회만 조회"),
    conn=Depends(get_db),
):
    return race_crud.get_races_by_course(conn, course_id, upcoming_only=upcoming_only)


@router.get("/{event_id}/nearby-accommodations", response_model=list[NearbyAccommodationOut])
def get_race_nearby_accommodations(
    event_id: int,
    radius_km: float = Query(5.0, gt=0, le=20),
    conn=Depends(get_db),
):
    race = race_crud.get_race_by_id(conn, event_id)
    if not race:
        raise HTTPException(status_code=404, detail="대회를 찾을 수 없습니다")
    return race_crud.get_nearby_accommodations(conn, event_id, radius_km=radius_km)