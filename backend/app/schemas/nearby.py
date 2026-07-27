from pydantic import BaseModel


class NearbySpotOut(BaseModel):
    id: int
    category: str
    name: str
    address: str | None
    image_url: str | None
    lat: float
    lng: float
    distance_m: int
    duration_minutes: int
    


class NearbyListResponse(BaseModel):
    total_count: int
    spots: list[NearbySpotOut]