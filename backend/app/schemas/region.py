from pydantic import BaseModel


# 지역 목록 (GET /api/regions)
class RegionOut(BaseModel):
    region_code: str
    name: str
    sido: str
    is_population_drop: bool
