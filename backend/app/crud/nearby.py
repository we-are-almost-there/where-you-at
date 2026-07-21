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
    "trail": {"attraction": 1500, "restaurant": 1000, "accommodation": 1000, "bicycle": 1000},
    "bicycle": {"attraction": 3000, "restaurant": 2000, "accommodation": 2000, "bicycle": 2000},
}

# route_type별 이동 속도(m/분)
_SPEED_M_PER_MIN = {
    "trail": 67,     # 도보 약 4km/h
    "bicycle": 300,  # 자전거 약 18km/h
}

_CACHE_TTL_DAYS = 30

_CACHE_LOOKUP_SQL = """
SELECT ns.nearby_content_id, ns.distance_km, ts.tour_spot_title AS name,
       ts.addr1 AS address, ts.first_image AS image_url
FROM nearby_spot ns
JOIN tour_spot ts ON ts.content_id = ns.nearby_content_id
WHERE ns.base_type = 'course' AND ns.base_id = %(course_id)s
    AND ns.nearby_type = %(category)s
    AND ns.route_type = %(route_type)s
    AND ns.expires_at > now()
ORDER BY ns.distance_km
"""

_BICYCLE_CACHE_LOOKUP_SQL = """
SELECT ns.nearby_content_id, ns.distance_km, bf.facility_title AS name,
       bf.addr1 AS address, NULL AS image_url
FROM nearby_spot ns
JOIN bicycle_facility bf ON bf.bicycle_id::text = ns.nearby_content_id
WHERE ns.base_type = 'course' AND ns.base_id = %(course_id)s
    AND ns.nearby_type = 'bicycle'
    AND ns.route_type = %(route_type)s
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

_BICYCLE_LIVE_QUERY_SQL = """
WITH course_line AS (
    SELECT ST_MakeLine(ST_MakePoint(lng, lat) ORDER BY sequence_order) AS geom
    FROM course_waypoint
    WHERE course_id = %(course_id)s AND route_type = %(route_type)s
)
SELECT
    bf.bicycle_id::text AS content_id,
    bf.facility_title AS name,
    bf.addr1 AS address,
    NULL AS image_url,
    ST_Distance(bf.geom::geography, cl.geom::geography) AS distance_m
FROM bicycle_facility bf, course_line cl
WHERE cl.geom IS NOT NULL
    AND ST_DWithin(bf.geom::geography, cl.geom::geography, %(radius)s)
ORDER BY distance_m
"""

_UPSERT_CACHE_SQL = """
INSERT INTO nearby_spot (base_type, base_id, nearby_type, nearby_content_id, route_type, distance_km, cached_at, expires_at)
VALUES %s
ON CONFLICT (base_type, base_id, nearby_type, nearby_content_id, route_type) DO UPDATE SET
    distance_km = EXCLUDED.distance_km,
    cached_at   = EXCLUDED.cached_at,
    expires_at  = EXCLUDED.expires_at
"""

_DELETE_STALE_CACHE_SQL = """
DELETE FROM nearby_spot
WHERE base_type = 'course' AND base_id = %(course_id)s AND nearby_type = %(category)s AND route_type = %(route_type)s
"""


def _fetch_live(conn, course_id: int, route_type: str, content_types: list[str], radius: int) -> list[dict]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            _LIVE_QUERY_SQL,
            {"course_id": course_id, "route_type": route_type, "content_types": content_types, "radius": radius},
        )
        return cur.fetchall()


def _fetch_bicycle_live(conn, course_id: int, route_type: str, radius: int) -> list[dict]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            _BICYCLE_LIVE_QUERY_SQL,
            {"course_id": course_id, "route_type": route_type, "radius": radius},
        )
        return cur.fetchall()


def _refresh_cache(conn, course_id: int, category: str, route_type: str, rows: list[dict]) -> None:
    """기존 캐시를 지우고 새로 계산한 결과로 채운다(30일 만료)."""
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=_CACHE_TTL_DAYS)
    with conn.cursor() as cur:
        cur.execute(
            _DELETE_STALE_CACHE_SQL,
            {"course_id": str(course_id), "category": category, "route_type": route_type},
        )
        if rows:
            values = [
                ("course", str(course_id), category, row["content_id"], route_type, row["distance_m"] / 1000, now, expires)
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
    """코스 경로 주변의 관광지/음식점/숙박/자전거 시설 목록을 (total_count, 목록)으로 반환한다.
    nearby_spot 캐시(30일, route_type별 구분)를 우선 조회하고, 없거나 만료됐으면 PostGIS로 재계산 후 캐시에 저장한다.
    """
    if category == "bicycle":
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                _BICYCLE_CACHE_LOOKUP_SQL,
                {"course_id": str(course_id), "route_type": route_type},
            )
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
            radius = _RADIUS_M.get(route_type, _RADIUS_M["trail"]).get("bicycle", 1000)
            rows = _fetch_bicycle_live(conn, course_id, route_type, radius)
            _refresh_cache(conn, course_id, "bicycle", route_type, rows)

        speed = _SPEED_M_PER_MIN.get(route_type, _SPEED_M_PER_MIN["trail"])
        total = len(rows)
        page_rows = rows[(page - 1) * size : (page - 1) * size + size]
        return total, [
            {
                "id": r["content_id"],
                "category": "bicycle",
                "name": r["name"],
                "address": r["address"],
                "image_url": r["image_url"],
                "distance_m": int(r["distance_m"]),
                "duration_minutes": max(1, round(r["distance_m"] / speed)),
            }
            for r in page_rows
        ]

    content_types = _CATEGORY_CONTENT_TYPES.get(category)
    if not content_types:
        return 0, []

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            _CACHE_LOOKUP_SQL,
            {"course_id": str(course_id), "category": category, "route_type": route_type},
        )
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
        _refresh_cache(conn, course_id, category, route_type, rows)

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