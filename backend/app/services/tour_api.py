"""한국관광공사 TourAPI(국문 관광정보) 클라이언트.

코스 경로 좌표를 여러 지점 샘플링해, 경로에 가장 가까운 관광지의
대표 이미지를 코스 대표 이미지로 선정한다.
"""
import math
import httpx

from ..core.config import settings

_LIST_URL = "http://apis.data.go.kr/B551011/KorService2/locationBasedList2"
_SAMPLE_COUNT = 8       # 경로에서 뽑을 지점 수
_RADIUS = 700           # 각 지점 주변 검색 반경(m)
_CONTENT_TYPE_TOUR = 12  # 관광지


def find_course_image(waypoints: list[dict]) -> str | None:
    """경로 좌표 주변 관광지 중 경로에 가장 가까운 곳의 대표 이미지 URL.

    waypoints: [{"lat": float, "lng": float}, ...]
    1차로 좁은 반경의 관광지만 찾고, 없으면 넓은 반경·전체 타입으로 재시도한다.
    이미지 후보가 없으면 None.
    """
    if not settings.tour_api_key or len(waypoints) < 2:
        return None

    # 1차: 좁은 반경, 관광지(12)만 → 코스에 밀착한 명소
    img = _best_image(waypoints, radius=_RADIUS, content_type=_CONTENT_TYPE_TOUR)
    if img:
        return img
    # 2차(시골 등): 넓은 반경, 전체 타입
    return _best_image(waypoints, radius=3000, content_type=None)


def _best_image(waypoints: list[dict], radius: int, content_type: int | None) -> str | None:
    # title → (lat, lng, image_url) 후보 수집 (중복 제거)
    candidates: dict[str, tuple[float, float, str]] = {}
    for wp in _sample(waypoints, _SAMPLE_COUNT):
        for item in _nearby_tour_spots(wp["lat"], wp["lng"], radius, content_type):
            img = item.get("firstimage")
            title = item.get("title")
            if img and title and title not in candidates:
                candidates[title] = (float(item["mapy"]), float(item["mapx"]), img)

    if not candidates:
        return None

    # 경로(전체 waypoint)와의 최단거리가 가장 작은 후보 선택
    best = min(
        candidates.values(),
        key=lambda c: min(_haversine(c[0], c[1], w["lat"], w["lng"]) for w in waypoints),
    )
    return best[2]


def _nearby_tour_spots(lat: float, lng: float, radius: int, content_type: int | None) -> list[dict]:
    """한 좌표 주변 관광지 목록(거리순)을 조회한다. 실패 시 빈 리스트."""
    params = {
        "serviceKey": settings.tour_api_key,
        "MobileOS": "ETC",
        "MobileApp": "where-you-at",
        "_type": "json",
        "mapX": lng,
        "mapY": lat,
        "radius": radius,
        "numOfRows": 10,
        "pageNo": 1,
        "arrange": "E",
    }
    if content_type is not None:
        params["contentTypeId"] = content_type

    try:
        resp = httpx.get(_LIST_URL, params=params, timeout=15)
        resp.raise_for_status()
        items = resp.json().get("response", {}).get("body", {}).get("items")
    except Exception:
        return []

    if not items or isinstance(items, str):
        return []
    item = items.get("item", [])
    return item if isinstance(item, list) else [item]


def _sample(waypoints: list[dict], n: int) -> list[dict]:
    if len(waypoints) <= n:
        return waypoints
    step = len(waypoints) / n
    return [waypoints[int(i * step)] for i in range(n)]


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return int(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))
