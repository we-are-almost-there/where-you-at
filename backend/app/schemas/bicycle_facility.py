from datetime import datetime
from pydantic import BaseModel

class BicycleFacilitySummary(BaseModel):
    id: int
    facility_title: str
    addr1: str | None
    map_x: float
    map_y: float
    facility_type: str
    rental_fee_type: str | None
    repair_available: bool | None
    open_hours: str | None
    total_bikes: int | None
    available_bikes: int | None
    region_code: str | None
    realtime_synced_at: datetime | None = None

class BicycleFacilityListResponse(BaseModel):
    total_count: int
    page: int
    size: int
    facilities: list[BicycleFacilitySummary]

class BicycleRegionOption(BaseModel):
    sido: str
    sido_code: str

class BicycleSigunguOption(BaseModel):
    region_code: str
    name: str
