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
# 2차 폴백에서 허용할 관광 계열 콘텐츠 타입(음식점 39·숙박 32·쇼핑 38 제외).
# 12 관광지 / 14 문화시설 / 28 레포츠
_SIGHT_TYPES = {"12", "14", "28"}


def find_course_image(waypoints: list[dict], used: set[str] | None = None) -> str | None:
    """경로 좌표 주변 관광지 중 경로에 가장 가까운 곳의 대표 이미지 URL.

    waypoints: [{"lat": float, "lng": float}, ...]
    used: 다른 코스가 이미 쓴 이미지 URL 집합. 중복을 피해 차순위 명소를 고른다.
    1차로 좁은 반경의 관광지만 찾고, 없으면 넓은 반경·관광 계열 타입으로 재시도한다.
    이미지 후보가 없으면 None.
    """
    if not settings.tour_api_key or len(waypoints) < 2:
        return None

    # 1차: 좁은 반경, 관광지(12)만 → 코스에 밀착한 명소
    img = _best_image(waypoints, radius=_RADIUS, content_type=_CONTENT_TYPE_TOUR, used=used)
    if img:
        return img
    # 2차(시골 등): 넓은 반경 + 관광 계열 타입만(음식점/숙박/쇼핑 제외)
    return _best_image(waypoints, radius=3000, content_type=None, allowed_types=_SIGHT_TYPES, used=used)


def _best_image(
    waypoints: list[dict],
    radius: int,
    content_type: int | None,
    allowed_types: set[str] | None = None,
    used: set[str] | None = None,
) -> str | None:
    # title → (lat, lng, image_url) 후보 수집 (중복 제거)
    candidates: dict[str, tuple[float, float, str]] = {}
    for wp in _sample(waypoints, _SAMPLE_COUNT):
        for item in _nearby_tour_spots(wp["lat"], wp["lng"], radius, content_type):
            img = item.get("firstimage")
            title = item.get("title")
            if not (img and title) or title in candidates:
                continue
            # 타입 제한(폴백)에서 음식점/숙박 등 관광 외 콘텐츠는 제외
            if allowed_types is not None and str(item.get("contenttypeid")) not in allowed_types:
                continue
            candidates[title] = (float(item["mapy"]), float(item["mapx"]), img)

    if not candidates:
        return None

    # 다른 코스가 이미 쓴 이미지는 피한다(중복 방지). 남는 후보가 없으면 그대로 최근접 사용.
    pool = {t: c for t, c in candidates.items() if used is None or c[2] not in used}
    if not pool:
        pool = candidates

    # 경로(전체 waypoint)와의 최단거리가 가장 작은 후보 선택
    best = min(
        pool.values(),
        key=lambda c: min(_haversine(c[0], c[1], w["lat"], w["lng"]) for w in waypoints),
    )
    return best[2]


# 대표 관광지 선정용 샘플 지점 수 (이미지 선정용 _SAMPLE_COUNT와 별개, 긴 노선 커버리지↑)
_ATTRACTION_SAMPLES = 15


def top_attractions(waypoints: list[dict], n: int = 4) -> list[str]:
    """경로 근접순 대표 관광지 이름을 최대 n개 반환한다.

    관광지(12)만 대상으로 1차 700m, 없으면 3km로 넓혀 재시도한다
    (식당·숙박·홍보문구 등 타 유형 혼입 방지). 경로에 가까운 순으로 정렬.
    """
    if not settings.tour_api_key or len(waypoints) < 2:
        return []
    names = _nearby_titles(waypoints, radius=_RADIUS, content_type=_CONTENT_TYPE_TOUR)
    if not names:
        names = _nearby_titles(waypoints, radius=3000, content_type=_CONTENT_TYPE_TOUR)
    return names[:n]


def _nearby_titles(waypoints: list[dict], radius: int, content_type: int | None) -> list[str]:
    # title → (lat, lng) 후보 수집(중복 제거) 후 경로 최단거리순 정렬
    candidates: dict[str, tuple[float, float]] = {}
    for wp in _sample(waypoints, _ATTRACTION_SAMPLES):
        for item in _nearby_tour_spots(wp["lat"], wp["lng"], radius, content_type):
            title = item.get("title")
            if title and item.get("mapx") and item.get("mapy") and title not in candidates:
                candidates[title] = (float(item["mapy"]), float(item["mapx"]))
    return [
        title
        for title, _ in sorted(
            candidates.items(),
            key=lambda kv: min(_haversine(kv[1][0], kv[1][1], w["lat"], w["lng"]) for w in waypoints),
        )
    ]


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
    step = (len(waypoints) - 1) / (n - 1)
    return [waypoints[round(i * step)] for i in range(n)]


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return int(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))

# ─────────────────────────────────────────────
# 관광지 배치 수집용 TourAPI
# ─────────────────────────────────────────────

TOUR_API_BASE_URL = "https://apis.data.go.kr/B551011/KorService2"

CONTENT_TYPES = [12, 14, 32, 38, 39]

DETAIL_TABLE_MAP = {
    "12": "attraction",
    "14": "attraction",
    "32": "accommodation",
    "38": "attraction",
    "39": "restaurant",
}


def fetch_area_based_list(
    content_type_id: int,
    page_no: int = 1,
    num_of_rows: int = 100,
) -> tuple[list[dict], int]:
    """유형별 전국 관광정보 목록을 페이지 단위로 조회한다."""

    params = {
        "serviceKey": settings.tour_api_key,
        "MobileOS": "ETC",
        "MobileApp": "where-you-at",
        "_type": "json",
        "arrange": "A",
        "contentTypeId": content_type_id,
        "pageNo": page_no,
        "numOfRows": num_of_rows,
    }

    try:
        response = httpx.get(
            f"{TOUR_API_BASE_URL}/areaBasedList2",
            params=params,
            timeout=15,
        )
        response.raise_for_status()

        body = response.json().get("response", {}).get("body", {})
        items = _extract_batch_items(body.get("items"))
        total_count = int(body.get("totalCount", 0))

        return items, total_count

    except (httpx.HTTPError, ValueError, TypeError):
        return [], 0


def fetch_detail_intro(
    content_id: str,
    content_type_id: str,
) -> dict | None:
    """타입별 부가 정보를 조회한다.

    관광지·숙박·음식점 유형에 따라 주차, 영업시간,
    체크인·체크아웃 등의 상세정보가 반환된다.
    """

    params = {
        "serviceKey": settings.tour_api_key,
        "MobileOS": "ETC",
        "MobileApp": "where-you-at",
        "_type": "json",
        "contentId": content_id,
        "contentTypeId": content_type_id,
    }

    try:
        response = httpx.get(
            f"{TOUR_API_BASE_URL}/detailIntro2",
            params=params,
            timeout=15,
        )
        response.raise_for_status()

        items = (
            response.json()
            .get("response", {})
            .get("body", {})
            .get("items")
        )

        results = _extract_batch_items(items)
        return results[0] if results else None

    except (httpx.HTTPError, ValueError, TypeError):
        return None


def _extract_batch_items(items: object) -> list[dict]:
    """TourAPI의 빈 문자열, 단일 객체, 배열 응답을 리스트로 통일한다."""

    if not items or isinstance(items, str):
        return []

    if not isinstance(items, dict):
        return []

    item = items.get("item", [])

    if isinstance(item, list):
        return item

    if isinstance(item, dict):
        return [item]

    return []