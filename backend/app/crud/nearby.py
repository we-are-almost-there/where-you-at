import logging
from datetime import datetime, timedelta, timezone
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
import hashlib
import json
from time import perf_counter

_CATEGORY_CONTENT_TYPES = {
    "attraction": ["12", "14", "38"],
    "restaurant": ["39"],
    "accommodation": ["32"],
}

_RADIUS_M = {
    "trail": {"attraction": 1500, "restaurant": 1000, "accommodation": 1000, "bicycle": 1000},
    "bicycle": {"attraction": 3000, "restaurant": 2000, "accommodation": 2000, "bicycle": 2000},
}

_SPEED_M_PER_MIN = {
    "trail": 67,
    "bicycle": 300,
}

_CACHE_TTL_DAYS = 30
# 정상 조회 0건 표시. tour_spot ID(varchar(20))보다 길고 자전거 숫자 ID와도 겹치지 않는다.
_EMPTY_CONTENT_ID = "__empty_nearby_result__"

_EMPTY_CACHE_LOOKUP_SQL = """
SELECT 1 FROM nearby_spot
WHERE base_type = 'course' AND base_id = %(course_id)s AND nearby_type = %(category)s
    AND nearby_content_id = %(empty_id)s
    AND route_type = %(route_type)s AND expires_at > now()
"""

_CACHE_LOOKUP_SQL = """
SELECT ns.nearby_content_id, ns.distance_km, ts.tour_spot_title AS name,
       ts.addr1 AS address, ts.first_image AS image_url,
       ts.map_y AS lat, ts.map_x AS lng
FROM nearby_spot ns
JOIN tour_spot ts ON ts.content_id = ns.nearby_content_id
WHERE ns.base_type = 'course' AND ns.base_id = %(course_id)s
    AND ns.nearby_type = %(category)s
    AND ns.route_type = %(route_type)s
    AND ns.expires_at > now()
ORDER BY ns.distance_km, ns.nearby_content_id
"""

_BICYCLE_CACHE_LOOKUP_SQL = """
SELECT ns.nearby_content_id, ns.distance_km, bf.facility_title AS name,
       bf.addr1 AS address, NULL AS image_url,
       bf.map_y AS lat, bf.map_x AS lng
FROM nearby_spot ns
JOIN bicycle_facility bf ON bf.bicycle_id::text = ns.nearby_content_id
WHERE ns.base_type = 'course' AND ns.base_id = %(course_id)s
    AND ns.nearby_type = 'bicycle'
    AND ns.route_type = %(route_type)s
    AND ns.expires_at > now()
ORDER BY ns.distance_km, ns.nearby_content_id
"""

# 기존 geom 공간 인덱스로 후보를 먼저 거르기 위한 보수적인 검색 범위.
# 최종 포함 여부와 거리는 기존 geography 조건으로 계산한다.
#
# 국내 주변 범위(경도 120~135, 위도 30~45)에서는 경도 1도가 약 78km 이상이다.
# 반경(m)을 70000으로 나누면 경도·위도 양쪽에 필요한 범위보다 넓은 여유를 둔다.
# 111000(위도 1도의 근삿값)으로 바꾸면 경도 방향 범위가 좁아져 장소가 누락될 수 있다.
#
# ST_Segmentize의 1000은 geography 경로를 최대 1km 길이의 구간으로 나누는 값이다.
# 추가 0.001도는 구간 사이 곡선과 수치 오차를 고려한 보수적인 여유이며,
# 엄밀히 계산한 최대 오차를 뜻하지 않는다.
#
# 위 좌표 범위를 벗어나는 경로는 환산 가정을 적용하지 않고,
# 전 세계 경계 상자를 사용해 후보 범위를 제한하지 않는다.
_COURSE_BOUNDS_CTE = """
WITH course_line AS (
    SELECT ST_MakeLine(ST_MakePoint(lng, lat) ORDER BY sequence_order) AS geom
    FROM course_waypoint
    WHERE course_id = %(course_id)s AND route_type = %(route_type)s
), course_bounds AS (
    SELECT geom,
        CASE WHEN ST_XMin(Box2D(geom)) >= 120 AND ST_XMax(Box2D(geom)) <= 135
                  AND ST_YMin(Box2D(geom)) >= 30 AND ST_YMax(Box2D(geom)) <= 45
             THEN ST_Expand(
                 ST_Envelope(ST_Segmentize(geom::geography, 1000)::geometry),
                 %(radius)s / 70000.0 + 0.001)
             ELSE ST_MakeEnvelope(-180, -90, 180, 90, 4326)
        END AS bounds
    FROM course_line
)
"""

_LIVE_QUERY_SQL = _COURSE_BOUNDS_CTE + """
SELECT
    ts.content_id,
    ts.tour_spot_title AS name,
    ts.addr1 AS address,
    ts.first_image AS image_url,
    ts.map_y AS lat,
    ts.map_x AS lng,
    ST_Distance(ts.geom::geography, cl.geom::geography) AS distance_m
FROM tour_spot ts, course_bounds cl
WHERE ts.content_type_id = ANY(%(content_types)s)
    AND cl.geom IS NOT NULL
    AND ts.geom && cl.bounds
    AND ST_DWithin(ts.geom::geography, cl.geom::geography, %(radius)s)
ORDER BY distance_m, ts.content_id
"""

_BICYCLE_LIVE_QUERY_SQL = _COURSE_BOUNDS_CTE + """
SELECT
    bf.bicycle_id::text AS content_id,
    bf.facility_title AS name,
    bf.addr1 AS address,
    NULL AS image_url,
    bf.map_y AS lat,
    bf.map_x AS lng,
    ST_Distance(bf.geom::geography, cl.geom::geography) AS distance_m
FROM bicycle_facility bf, course_bounds cl
WHERE cl.geom IS NOT NULL
    AND bf.geom && cl.bounds
    AND ST_DWithin(bf.geom::geography, cl.geom::geography, %(radius)s)
ORDER BY distance_m, bf.bicycle_id::text
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

logger = logging.getLogger(__name__)

def _refresh_cache(
    conn,
    course_id: int,
    category: str,
    route_type: str,
    rows: list[dict],
    *,
    strict_cache: bool = False,
) -> None:
    """기존 캐시를 교체한다. 장소 목록과 정상 조회의 빈 결과 모두 30일 보관한다.

    경로가 있고 0건이면 기존 테이블에 예약 ID의 표시 행 하나를 저장한다. distance_km=0은
    필수 컬럼을 채우는 값이며, 빈 결과 여부는 거리 대신 예약 ID로 판별한다.

    DB 오류 시 로그를 남기고 연결 전체의 롤백을 시도한다.
    기본 모드에서는 호출부가 이미 구한 조회 결과를 반환할 수 있도록
    DB 오류를 처리하며, strict_cache=True이면 최초 DB 오류를 다시 전파한다.
    SQL 문법 오류도 DB 오류에 포함된다.
    KeyError, TypeError 등 Python 데이터 처리 오류는 그대로 전파한다.

    성공 시 연결 전체를 커밋하므로 다른 미커밋 쓰기 작업과 공유하지 않아야 한다.
    기본 모드는 롤백 실패도 처리하므로 반환만으로 연결 재사용 가능 여부를
    판단해서는 안 된다.
    """
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=_CACHE_TTL_DAYS)

    try:
        with conn.cursor() as cur:
            if not rows:
                # 경로 미수집은 정상적인 주변 정보 0건 결과와 구분한다.
                cur.execute(
                    """SELECT 1 FROM course_waypoint
                    WHERE course_id = %(course_id)s AND route_type = %(route_type)s
                        AND lat IS NOT NULL AND lng IS NOT NULL
                    LIMIT 1""",
                    {"course_id": course_id, "route_type": route_type},
                )
                if cur.fetchone() is None:
                    return
            cur.execute(
                _DELETE_STALE_CACHE_SQL,
                {
                    "course_id": str(course_id),
                    "category": category,
                    "route_type": route_type,
                },
            )
            if rows:
                values = [
                    (
                        "course",
                        str(course_id),
                        category,
                        row["content_id"],
                        route_type,
                        row["distance_m"] / 1000,
                        now,
                        expires,
                    )
                    for row in rows
                ]
            else:
                values = [("course", str(course_id), category, _EMPTY_CONTENT_ID,
                           route_type, 0, now, expires)]
            execute_values(cur, _UPSERT_CACHE_SQL, values, page_size=1000)
        conn.commit()

    except psycopg2.Error:
        logger.exception(
            "nearby_spot 캐시 갱신 실패: course_id=%s category=%s route_type=%s",
            course_id,
            category,
            route_type,
        )
        try:
            conn.rollback()
        except psycopg2.Error:
            logger.exception("nearby_spot 캐시 갱신 실패 후 롤백도 실패")

        if strict_cache:
            raise


def _rows_from_cache(cached_rows: list[dict]) -> list[dict]:
    """캐시 조회 결과(RealDictRow)를 실시간 조회 결과와 동일한 키 구조로 맞춘다."""
    return [
        {
            "content_id": r["nearby_content_id"],
            "name": r["name"],
            "address": r["address"],
            "image_url": r["image_url"],
            "lat": r["lat"],
            "lng": r["lng"],
            "distance_m": r["distance_km"] * 1000,
        }
        for r in cached_rows
    ]


def _has_empty_cache(conn, course_id: int, category: str, route_type: str) -> bool:
    """일반 캐시에 결과가 없을 때 정상적인 0건 결과의 유효 여부를 확인한다."""
    with conn.cursor() as cur:
        cur.execute(
            _EMPTY_CACHE_LOOKUP_SQL,
            {"course_id": str(course_id), "category": category,
             "route_type": route_type, "empty_id": _EMPTY_CONTENT_ID},
        )
        return cur.fetchone() is not None


def _get_rows(
    conn,
    course_id: int,
    category: str,
    route_type: str,
    *,
    strict_cache: bool = False,
    force_refresh: bool = False,
) -> list[dict]:
    """nearby_spot 캐시(30일, route_type별 구분)를 우선 조회하고, 없거나 만료됐으면 PostGIS로
    재계산 후 캐시에 저장한다. 이름·주소·이미지·좌표는 원본 테이블에서 조회한다.
    거리와 목록 포함 여부는 캐시 생성 시점 기준이며, 소요시간은 해당 거리로 계산한다.
    원본 좌표나 코스 경로가 변경돼도 캐시를 무효화·재생성하지 않으면
    만료 전까지 기존 거리와 목록이 유지될 수 있다.
    경로가 있고 정상 조회 결과가 0개이면 표시 행으로 30일간 빈 결과를 반환한다.
    경로가 아직 없는 경우에는 빈 결과를 저장하지 않는다.
    원본 변경 시 자동 무효화하지 않으며, 만료 또는 수동 재생성 때 다시 조회한다.
    """
    if force_refresh:
        return refresh_nearby_rows(conn, course_id, category, route_type, strict_cache=strict_cache)
    if category == "bicycle":
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                _BICYCLE_CACHE_LOOKUP_SQL,
                {"course_id": str(course_id), "route_type": route_type},
            )
            cached_rows = cur.fetchall()

        if cached_rows:
            return _rows_from_cache(cached_rows)

        if _has_empty_cache(conn, course_id, category, route_type):
            return []

        return refresh_nearby_rows(conn, course_id, category, route_type, strict_cache=strict_cache)

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            _CACHE_LOOKUP_SQL,
            {"course_id": str(course_id), "category": category, "route_type": route_type},
        )
        cached_rows = cur.fetchall()

    if cached_rows:
        return _rows_from_cache(cached_rows)

    if _has_empty_cache(conn, course_id, category, route_type):
        return []

    return refresh_nearby_rows(conn, course_id, category, route_type, strict_cache=strict_cache)


def refresh_nearby_rows(conn, course_id, category, route_type, *, strict_cache):
    """Compute first, then atomically replace the cache; failures preserve old rows."""
    started = perf_counter()
    radius = _RADIUS_M.get(route_type, _RADIUS_M["trail"])[category]
    if category == "bicycle":
        rows = _fetch_bicycle_live(conn, course_id, route_type, radius)
    else:
        rows = _fetch_live(conn, course_id, route_type, _CATEGORY_CONTENT_TYPES[category], radius)
    queried = perf_counter()
    try:
        _refresh_cache(conn, course_id, category, route_type, rows, strict_cache=strict_cache)
    finally:
        logger.info(
            "nearby_refresh course_id=%s route_type=%s category=%s rows=%s live_ms=%.1f cache_ms=%.1f",
            course_id, route_type, category, len(rows),
            (queried - started) * 1000, (perf_counter() - queried) * 1000,
        )
    return rows


def _paginate(rows: list[dict], category: str, route_type: str, page: int, size: int) -> tuple[int, list[dict]]:
    """전체 결과를 페이지 단위로 자르고 응답 형태(거리·소요시간 포함)로 변환한다."""
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
            "lat": row["lat"],
            "lng": row["lng"],
            "distance_m": round(row["distance_m"]),  # 단위 왕복 오차로 버림 결과가 1m 작아지는 문제 완화
            "duration_minutes": max(1, round(row["distance_m"] / speed)),
        }
        for row in page_rows
    ]
    return total, spots

def _make_list_version(
    course_id: int,
    category: str,
    route_type: str,
    rows: list[dict],
) -> str:
    """전체 목록의 장소 추가·삭제·순서 변경을 감지하는 버전을 만든다.

    rows는 SQL이 반환한 거리순을 그대로 사용하며, ID를 별도로 정렬하지 않는다.
    ID와 순서가 같으면 이름·거리 등 다른 필드가 변경돼도 버전은 유지된다.
    """
    payload = [
        course_id,
        category,
        route_type,
        [row["content_id"] for row in rows],
    ]
    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

def list_nearby_spots(
    conn,
    course_id: int,
    category: str,
    route_type: str = "trail",
    page: int = 1,
    size: int = 20,
    *,
    strict_cache: bool = False,
    force_refresh: bool = False,
) -> tuple[int, list[dict], str]:
    """주변 장소의 전체 개수, 현재 페이지 목록, 전체 목록 버전을 반환한다."""
    if category != "bicycle" and category not in _CATEGORY_CONTENT_TYPES:
        return 0, [], _make_list_version(
            course_id, category, route_type, []
        )

    rows = _get_rows(
        conn,
        course_id,
        category,
        route_type,
        strict_cache=strict_cache,
        force_refresh=force_refresh,
    )
    version = _make_list_version(course_id, category, route_type, rows)
    total, spots = _paginate(rows, category, route_type, page, size)
    return total, spots, version
