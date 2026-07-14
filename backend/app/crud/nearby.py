from datetime import datetime, timedelta, timezone
from psycopg2.extras import RealDictCursor, execute_values

# category → tour_spot.content_type_id 매핑
_CATEGORY_CONTENT_TYPES = {
    "attraction": ["12", "14", "38"],
    "restaurant": ["39"],
    "accommodation": ["32"],
}

# route_type별 카테고리별 기본 반경(m)
_RADIUS_M = {
    "trail": {"attraction": 1500, "restaurant": 1000, "accommodation": 1000},
    "bicycle": {"attraction": 3000, "restaurant": 2000, "accommodation": 2000},
}

# route_type별 이동 속도(m/분)
_SPEED_M_PER_MIN = {
    "trail": 67,     # 도보 약 4km/h
    "bicycle": 300,  # 자전거 약 18km/h
}

_CACHE_TTL_DAYS = 30

# ⚠️ TODO: nearby_spot에 route_type 컬럼이 없어서 캐시가 route_type을 구분하지 못한다.
# 지금은 도보(trail) 기준으로 계산된 캐시가 자전거 조회에도 그대로 재사용될 수 있다.
# route_type 컬럼 추가(팀원 협의 필요)가 반영되면 캐시 조회/저장 쿼리에 route_type 조건을 추가해야 한다.

_CACHE_LOOKUP_SQL = """
SELECT ns.nearby_content_id, ns.distance_km, ts.tour_spot_title AS name,
       ts.addr1 AS address, ts.first_image AS image_url
FROM nearby_spot ns
JOIN tour_spot ts ON ts.content_id = ns.nearby_content_id
WHERE ns.base_type = 'course' AND ns.base_id = %(course_id)s
    AND ns.nearby_type = %(category)s
    AND ns.expires_at > now()
ORDER BY ns.distance_km
"""

_LIVE_QUERY_SQL = """
WITH course_line AS (
    SELECT ST_MakeLine(ST_MakePoint(lng, lat) ORDER BY sequence_order) AS geom
    FROM course_waypoint
    WHERE course_id = %(course_id)s AND route_type = %(route_type)s
)
SELECT
    ts.content_id,
    ts.tour_spot_title AS name,
    ts.addr1 AS address,
    ts.first_image AS image_url,
    ST_Distance(ts.geom::geography, cl.geom::geography) AS distance_m
FROM tour_spot ts, course_line cl
WHERE ts.content_type_id = ANY(%(content_types)s)
    AND cl.geom IS NOT NULL
    AND ST_DWithin(ts.geom::geography, cl.geom::geography, %(radius)s)
ORDER BY distance_m
"""

_UPSERT_CACHE_SQL = """
INSERT INTO nearby_spot (base_type, base_id, nearby_type, nearby_content_id, distance_km, cached_at, expires_at)
VALUES %s
ON CONFLICT (base_type, base_id, nearby_type, nearby_content_id) DO UPDATE SET
    distance_km = EXCLUDED.distance_km,
    cached_at   = EXCLUDED.cached_at,
    expires_at  = EXCLUDED.expires_at
"""

_DELETE_STALE_CACHE_SQL = """
DELETE FROM nearby_spot
WHERE base_type = 'course' AND base_id = %(course_id)s AND nearby_type = %(category)s
"""


def _fetch_live(conn, course_id: int, route_type: str, content_types: list[str], radius: int) -> list[dict]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            _LIVE_QUERY_SQL,
            {"course_id": course_id, "route_type": route_type, "content_types": content_types, "radius": radius},
        )
        return cur.fetchall()


def _refresh_cache(conn, course_id: int, category: str, rows: list[dict]) -> None:
    """기존 캐시를 지우고 새로 계산한 결과로 채운다(30일 만료)."""
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=_CACHE_TTL_DAYS)
    with conn.cursor() as cur:
        cur.execute(_DELETE_STALE_CACHE_SQL, {"course_id": str(course_id), "category": category})
        if rows:
            values = [
                ("course", str(course_id), category, row["content_id"], row["distance_m"] / 1000, now, expires)
                for row in rows
            ]
            execute_values(cur, _UPSERT_CACHE_SQL, values)
    conn.commit()


def list_nearby_spots(
    conn,
    course_id: int,
    category: str,
    route_type: str = "trail",
    page: int = 1,
    size: int = 20,
) -> tuple[int, list[dict]]:
    """코스 경로 주변의 관광지/음식점/숙박 목록을 (total_count, 목록)으로 반환한다.
    nearby_spot 캐시(30일)를 우선 조회하고, 없거나 만료됐으면 PostGIS로 재계산 후 캐시에 저장한다.
    주의: 캐시는 아직 route_type을 구분하지 않는다 (컬럼 추가 대기 중).
    """
    # nearby_spot 캐시가 route_type을 구분하지 못해 자전거 코스에 도보 기준 캐시가 재사용되는 것을 방지
    # route_type 컬럼 추가 후 제거 예정
    if route_type == "bicycle":
        return 0, []
    
    content_types = _CATEGORY_CONTENT_TYPES.get(category)
    if not content_types:
        return 0, []

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(_CACHE_LOOKUP_SQL, {"course_id": str(course_id), "category": category})
        cached_rows = cur.fetchall()

    if cached_rows:
        rows = [
            {
                "content_id": r["nearby_content_id"],
                "name": r["name"],
                "address": r["address"],
                "image_url": r["image_url"],
                "distance_m": r["distance_km"] * 1000,
            }
            for r in cached_rows
        ]
    else:
        radius = _RADIUS_M.get(route_type, _RADIUS_M["trail"]).get(category, 1500)
        rows = _fetch_live(conn, course_id, route_type, content_types, radius)
        _refresh_cache(conn, course_id, category, rows)

    total = len(rows)
    page_rows = rows[(page - 1) * size : (page - 1) * size + size]

    speed = _SPEED_M_PER_MIN.get(route_type, _SPEED_M_PER_MIN["trail"])
    spots = [
        {
            "id": row["content_id"],
            "category": category,
            "name": row["name"],
            "address": row["address"],
            "image_url": row["image_url"],
            "distance_m": int(row["distance_m"]),
            "duration_minutes": max(1, round(row["distance_m"] / speed)),
        }
        for row in page_rows
    ]
    return total, spots