from psycopg2.extras import execute_values, RealDictCursor

from .region import normalize_address

_WAYPOINT_BATCH = 500
_THUMBNAIL_POINTS = 40  # 썸네일 1개당 추출할 대략적인 좌표 수

# sort 파라미터: ORDER BY 절 화이트리스트 (상수만 들어가므로 SQL injection 안전)
# 뒤의 c.id는 보조 정렬: 값이 같은 코스끼리 페이지 요청마다 순서가 바뀌면 중복 노출이나 누락이 생긴다.
_SORT_COLUMNS = {
    "distance_asc": "cr.distance ASC, c.id",
    "distance_desc": "cr.distance DESC, c.id",
    "time_asc": "cr.estimated_time ASC, c.id",
    "time_desc": "cr.estimated_time DESC, c.id",
}



# 조회 (API)
_DETAIL_SQL = """
SELECT
    c.id,
    c.course_title AS title,
    c.description,
    c.start_address,
    c.region_code,
    c.image_url,
    c.original_gpx_url,
    COALESCE(r.is_population_drop, false) AS is_population_drop_zone
FROM course c
LEFT JOIN region r ON c.region_code = r.region_code
WHERE c.id = %s
"""


_DETAIL_ROUTES_SQL = """
SELECT route_type, distance, estimated_time, difficulty,
        start_lat, start_lng, min_lat, max_lat, min_lng, max_lng
FROM course_route
WHERE course_id = %s
ORDER BY route_type
"""


def get_course_detail(conn, course_id: int) -> dict | None:
    """코스 상세 1건 + 주행방식별 경로(routes)를 조회, 없으면 None"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(_DETAIL_SQL, (course_id,))
        course = cur.fetchone()
        if not course:
            return None
        cur.execute(_DETAIL_ROUTES_SQL, (course_id,))
        course["routes"] = cur.fetchall()
    course["start_address"] = normalize_address(course["start_address"], course["region_code"])
    return course


def get_waypoints(conn, course_id: int, route_type: str = "trail") -> list[dict]:
    """코스의 한 주행방식 전체 좌표를 sequence_order 순으로 반환한다 (상세 지도용)"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT lat, lng FROM course_waypoint "
            "WHERE course_id = %s AND route_type = %s ORDER BY sequence_order",
            (course_id, route_type),
        )
        return cur.fetchall()


_COURSE_EXISTS_SQL = "SELECT 1 FROM course WHERE id = %s"


def course_exists(conn, course_id: int) -> bool:
    """코스 존재 여부만 가볍게 확인한다 (nearby 등에서 404 판별용)"""
    with conn.cursor() as cur:
        cur.execute(_COURSE_EXISTS_SQL, (course_id,))
        return cur.fetchone() is not None


def list_courses(
    conn,
    *,
    region: str | None = None,
    type: str | None = None,
    difficulty: str | None = None,
    keyword: str | None = None,
    distance: str | None = None,
    sort: str | None = None,
    page: int = 1,
    size: int = 20,
) -> tuple[int, list[dict]]:
    """필터, 정렬, 페이지네이션을 적용해 (total_count, 목록)을 반환한다.
    type(기본 trail)이 필터, 정렬의 '기준 주행방식',
    (예: type=bicycle → 자전거 경로가 있는 코스만, 자전거 거리/시간 기준 정렬)
    응답의 각 코스에는 보유한 모든 경로(routes)가 함께 담긴다.
    """
    base_type = type or "trail"
    where = ["cr.route_type = %s"]
    params: list = [base_type]

    if region:
        # 접두 매칭: "26"=부산 전체(광역시), "48220"=통영시 정확히. region 앞 N자리로 시도/시군 모두 커버.
        where.append("c.region_code LIKE %s")
        params.append(region + "%")
    if difficulty:
        where.append("cr.difficulty = %s")
        params.append(difficulty)
    if keyword:
        where.append("(c.course_title ILIKE %s OR c.description ILIKE %s)")
        params.extend([f"%{keyword}%", f"%{keyword}%"])
    if distance:
        min_d, max_d = _parse_distance_range(distance)
        if min_d is not None:
            where.append("cr.distance >= %s")
            params.append(min_d)
        if max_d is not None:
            where.append("cr.distance <= %s")
            params.append(max_d)

    where_sql = "WHERE " + " AND ".join(where)

    # 정렬: 화이트리스트 컬럼만. '가까운 순'은 서버에서 하지 않는다.
    # 이용자 위치를 서버로 받지 않기 위해 브라우저가 필터에 맞는 전체 목록을 받아 정렬한다
    # (frontend/src/features/map/nearestSort.ts). sort=nearest가 와도 기본(c.id) 정렬이다.
    order_sql = _SORT_COLUMNS.get(sort, "c.id")

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            f"SELECT count(*) AS total FROM course c "
            f"JOIN course_route cr ON c.id = cr.course_id {where_sql}",
            params,
        )
        total = cur.fetchone()["total"]

        cur.execute(
            f"""
            SELECT c.id, c.course_title AS title, c.start_address, c.image_url, c.region_code,
                    COALESCE(rg.is_population_drop, false) AS is_population_drop_zone
            FROM course c
            JOIN course_route cr ON c.id = cr.course_id
            LEFT JOIN region rg ON c.region_code = rg.region_code
            {where_sql}
            ORDER BY {order_sql}
            LIMIT %s OFFSET %s
            """,
            [*params, size, (page - 1) * size],
        )
        rows = cur.fetchall()

    attach_card_fields(conn, rows)
    return total, rows


def attach_card_fields(conn, rows: list[dict]) -> None:
    """코스 카드가 필요한 나머지 값(경로 메트릭, 썸네일 좌표, 관광지, 정규화한 주소)을 행에 채운다.

    코스 목록과 찜한 코스 목록이 같은 카드를 쓰므로 함께 쓴다. rows는 제자리에서 바뀐다.
    """
    if not rows:
        return
    ids = [r["id"] for r in rows]
    routes = _fetch_routes(conn, ids)
    paths = _fetch_simplified_paths(conn, ids)
    landmarks = _fetch_landmarks(conn, ids)
    for r in rows:
        r["routes"] = routes.get(r["id"], [])
        r["path_trail"] = paths.get((r["id"], "trail"), [])
        r["path_bicycle"] = paths.get((r["id"], "bicycle"), [])
        r["landmarks"] = landmarks.get(r["id"], [])
        r["start_address"] = normalize_address(r["start_address"], r["region_code"])


# 도보 경로가 있는 코스만 담는다. 홈 '가까운 코스'는 위치를 못 얻었을 때 GET /api/courses 기본값(type=trail)으로
# 대체하므로, 위치 허용 여부에 따라 보이는 코스 범위(도보만 / 자전거 전용 포함)가 달라지지 않게 맞춘다.
_STARTS_SQL = """
SELECT
    c.id, c.course_title AS title, c.start_address, c.image_url, c.region_code,
    t.start_lat, t.start_lng
FROM course c
JOIN course_route t ON t.course_id = c.id AND t.route_type = 'trail'
ORDER BY c.id
"""


def list_course_starts(conn) -> list[dict]:
    """도보 경로가 있는 모든 코스의 출발점과 카드 정보(썸네일 경로 좌표 제외)를 반환한다.

    홈 '가까운 코스'를 브라우저에서 고르기 위한 목록이라, 이용자 위치와 상관없이 항상 같은 결과를 준다.
    출발점은 도보 경로의 출발점이며, 위도·경도 중 하나라도 없으면 None이다(좌표가 섞이지 않게).
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(_STARTS_SQL)
        rows = cur.fetchall()
    if not rows:
        return []

    routes = _fetch_routes(conn, [r["id"] for r in rows])
    result = []
    for r in rows:
        has_start = r["start_lat"] is not None and r["start_lng"] is not None
        result.append(
            {
                "id": r["id"],
                "title": r["title"],
                "start_address": normalize_address(r["start_address"], r["region_code"]),
                "image_url": r["image_url"],
                "region_code": r["region_code"],
                "routes": routes.get(r["id"], []),
                "start": {"lat": r["start_lat"], "lng": r["start_lng"]} if has_start else None,
            }
        )
    return result


_ROUTES_SQL = """
SELECT course_id, route_type, distance, estimated_time, difficulty
FROM course_route
WHERE course_id = ANY(%s)
ORDER BY course_id, route_type
"""


def _fetch_routes(conn, course_ids: list[int]) -> dict[int, list[dict]]:
    """여러 코스의 경로 목록용을 course_id별로 묶어 반환한다."""
    result: dict[int, list[dict]] = {}
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(_ROUTES_SQL, (course_ids,))
        for row in cur.fetchall():
            result.setdefault(row["course_id"], []).append(
                {
                    "route_type": row["route_type"],
                    "distance": row["distance"],
                    "estimated_time": row["estimated_time"],
                    "difficulty": row["difficulty"],
                }
            )
    return result


_LANDMARKS_SQL = """
SELECT base_id::int AS course_id, tour_spot_title
FROM (
    SELECT
        base_id, tour_spot_title,
        row_number() OVER (PARTITION BY base_id ORDER BY min_dist, tour_spot_title) AS rn
    FROM (
        -- 이름 기준 중복 제거(같은 이름이 여러 content_id로 존재 가능) + 최단거리 채택
        SELECT ns.base_id, ts.tour_spot_title, MIN(ns.distance_km) AS min_dist
        FROM nearby_spot ns
        JOIN tour_spot ts ON ts.content_id = ns.nearby_content_id
        WHERE ns.base_type = 'course'
            AND ns.nearby_type = 'attraction'
            AND ns.base_id = ANY(%s)   -- base_id는 text 컬럼 → 문자열 리스트로 전달
        GROUP BY ns.base_id, ts.tour_spot_title
    ) d
) t
WHERE t.rn <= 3                  -- 코스별 가까운 관광지 최대 3개(이름 중복 제거 후)
ORDER BY base_id, rn
"""


def _fetch_landmarks(conn, course_ids: list[int]) -> dict[int, list[str]]:
    """여러 코스의 가장 가까운 대표 관광지 이름(최대 3개)을 course_id별로 묶어 반환한다.

    nearby_spot(주변 관광지/숙소 팀 소유)에 코스 attraction이 적재돼 있어야 값이 나온다.
    적재 전이면 빈 리스트로 폴백한다.
    """
    result: dict[int, list[str]] = {}
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(_LANDMARKS_SQL, ([str(i) for i in course_ids],))
        for row in cur.fetchall():
            result.setdefault(row["course_id"], []).append(row["tour_spot_title"])
    return result


_SIMPLIFIED_PATH_SQL = """
SELECT course_id, route_type, lat, lng
FROM (
    SELECT
        course_id, route_type, lat, lng, sequence_order,
        row_number() OVER (PARTITION BY course_id, route_type ORDER BY sequence_order) AS rn,
        count(*)     OVER (PARTITION BY course_id, route_type) AS cnt
    FROM course_waypoint
    WHERE course_id = ANY(%s)
) t
WHERE (rn - 1) %% GREATEST(cnt / %s, 1) = 0 OR rn = cnt  -- 균등 추출 + 종점(rn=cnt) 항상 보존
ORDER BY course_id, route_type, sequence_order
"""


def _fetch_simplified_paths(conn, course_ids: list[int]) -> dict[tuple[int, str], list[dict]]:
    """여러 코스의 (course_id, route_type)별 단순화 좌표를 한 번에 조회한다."""
    result: dict[tuple[int, str], list[dict]] = {}
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(_SIMPLIFIED_PATH_SQL, (course_ids, _THUMBNAIL_POINTS))
        for row in cur.fetchall():
            key = (row["course_id"], row["route_type"])
            result.setdefault(key, []).append({"lat": row["lat"], "lng": row["lng"]})
    return result


def _parse_distance_range(distance: str) -> tuple[float | None, float | None]:
    """'10-30' → (10, 30), '30-' → (30, None), '-10' → (None, 10). 잘못된 토큰은 무시(None)."""
    if "-" not in distance:
        return None, None
    lo, _, hi = distance.partition("-")

    def _to_float(s: str) -> float | None:
        s = s.strip()
        if not s:
            return None
        try:
            return float(s)
        except ValueError:
            return None  # 비숫자 입력은 500 대신 필터 미적용

    return _to_float(lo), _to_float(hi)


# 적재 (수집 스크립트)
_UPSERT_COURSE_SQL = """
INSERT INTO course (
    source_id, course_title, description, start_address, region_code, image_url, original_gpx_url
) VALUES (
    %(source_id)s, %(course_title)s, %(description)s, %(start_address)s,
    %(region_code)s, %(image_url)s, %(original_gpx_url)s
)
ON CONFLICT (source_id) DO UPDATE SET
    course_title     = EXCLUDED.course_title,
    description      = EXCLUDED.description,
    start_address    = EXCLUDED.start_address,
    region_code      = EXCLUDED.region_code,
    image_url        = EXCLUDED.image_url,
    original_gpx_url = EXCLUDED.original_gpx_url,
    updated_at       = now()
RETURNING id
"""


def upsert_course(conn, course_data: dict) -> int:
    """course 테이블에 source_id 기준으로 UPSERT하고 row의 id를 반환한다."""
    with conn.cursor() as cur:
        cur.execute(_UPSERT_COURSE_SQL, course_data)
        course_id = cur.fetchone()[0]
    conn.commit()
    return course_id


_UPSERT_ROUTE_SQL = """
INSERT INTO course_route (
    course_id, route_type, distance, estimated_time, difficulty,
    start_lat, start_lng, min_lat, max_lat, min_lng, max_lng
) VALUES (
    %(course_id)s, %(route_type)s, %(distance)s, %(estimated_time)s, %(difficulty)s,
    %(start_lat)s, %(start_lng)s, %(min_lat)s, %(max_lat)s, %(min_lng)s, %(max_lng)s
)
ON CONFLICT (course_id, route_type) DO UPDATE SET
    distance       = EXCLUDED.distance,
    estimated_time = EXCLUDED.estimated_time,
    difficulty     = EXCLUDED.difficulty,
    start_lat      = EXCLUDED.start_lat,
    start_lng      = EXCLUDED.start_lng,
    min_lat        = EXCLUDED.min_lat,
    max_lat        = EXCLUDED.max_lat,
    min_lng        = EXCLUDED.min_lng,
    max_lng        = EXCLUDED.max_lng
"""


def upsert_route(conn, route_data: dict) -> None:
    """course_route에 (course_id, route_type) 기준으로 UPSERT한다."""
    with conn.cursor() as cur:
        cur.execute(_UPSERT_ROUTE_SQL, route_data)
    conn.commit()


def upsert_waypoints(conn, course_id: int, waypoints: list[dict], route_type: str = "trail") -> None:
    """기존 waypoint를 삭제 후 새 좌표를 삽입한다.
    1,000개 이상의 waypoint를 안전하게 처리하기 위해 500개씩 배치 삽입한다.
    """
    rows = [
        (course_id, wp["lat"], wp["lng"], wp["sequence_order"], route_type)
        for wp in waypoints
    ]
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM course_waypoint WHERE course_id = %s AND route_type = %s",
            (course_id, route_type),
        )
        for i in range(0, len(rows), _WAYPOINT_BATCH):
            execute_values(
                cur,
                "INSERT INTO course_waypoint (course_id, lat, lng, sequence_order, route_type) VALUES %s",
                rows[i : i + _WAYPOINT_BATCH],
            )
    conn.commit()


def delete_route(conn, course_id: int, route_type: str) -> None:
    """한 주행방식의 course_route + course_waypoint를 삭제한다.
    재적재 시 조건에서 탈락한 경로(예: 자전거)를 지워 고아 데이터를 막는 용도.
    """
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM course_waypoint WHERE course_id = %s AND route_type = %s",
            (course_id, route_type),
        )
        cur.execute(
            "DELETE FROM course_route WHERE course_id = %s AND route_type = %s",
            (course_id, route_type),
        )
    conn.commit()
