from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel


class RaceOut(BaseModel):
    event_id: int
    source: str
    race_title: str
    event_type: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    location_name: Optional[str] = None
    map_x: Optional[float] = None
    map_y: Optional[float] = None
    region_code: Optional[str] = None
    contact: Optional[str] = None
    homepage_url: Optional[str] = None

    class Config:
        from_attributes = True


class RaceDetailOut(RaceOut):
    created_at: datetime
    synced_at: datetime


class RaceListResponse(BaseModel):
    total: int
    page: int
    per_page: int
    items: List[RaceOut]

class NearbyAccommodationOut(BaseModel):
    content_id: str
    tour_spot_title: str
    addr1: Optional[str] = None
    first_image: Optional[str] = None
    distance_km: float
    map_x: Optional[float] = None  # 경도
    map_y: Optional[float] = None  # 위도