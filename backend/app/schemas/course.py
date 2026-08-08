from pydantic import BaseModel


class LatLng(BaseModel):
    lat: float
    lng: float


class Bounds(BaseModel):
    min_lat: float
    max_lat: float
    min_lng: float
    max_lng: float


# 목록 (GET /api/courses) ──────────────────────────────
class RouteSummary(BaseModel):
    route_type: str
    distance: float
    estimated_time: int | None
    difficulty: str | None


class CourseSummary(BaseModel):
    id: int
    title: str
    start_address: str | None
    image_url: str | None
    region_code: str | None
    is_population_drop_zone: bool       # 인구감소지역 여부 (목록 카드 뱃지용)
    routes: list[RouteSummary]          # 도보/자전거 메트릭 (자전거 없으면 trail만)
    path_trail: list[LatLng]            # 도보 썸네일 좌표
    path_bicycle: list[LatLng]          # 자전거 썸네일 좌표 (없으면 빈 배열)
    landmarks: list[str] = []           # 코스와 가까운 대표 관광지 이름 (최대 3개)


class CourseListResponse(BaseModel):
    total_count: int
    page: int
    size: int
    courses: list[CourseSummary]


# 상세 (GET /api/courses/{id}) ─────────────────────────
class RouteDetail(BaseModel):
    route_type: str
    distance: float
    estimated_time: int | None
    difficulty: str | None
    start_lat: float | None
    start_lng: float | None
    bounds: Bounds


class CourseDetail(BaseModel):
    id: int
    title: str
    description: str | None
    start_address: str | None
    region_code: str | None
    image_url: str | None
    original_gpx_url: str | None
    is_population_drop_zone: bool
    routes: list[RouteDetail]


# 경로 좌표 (GET /api/courses/{id}/gpx) ────────────────
class GpxResponse(BaseModel):
    course_id: int
    route_type: str
    waypoints: list[LatLng]
