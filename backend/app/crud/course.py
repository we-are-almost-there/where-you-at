from psycopg2.extras import execute_values, RealDictCursor

_WAYPOINT_BATCH = 500
_THUMBNAIL_POINTS = 40  # 썸네일 1개당 추출할 대략적인 좌표 수

# sort 파라미터 → ORDER BY 컬럼 화이트리스트 (SQL injection 방지)
_SORT_COLUMNS = {
    "distance": "cr.distance",
    "estimated_time": "cr.estimated_time",
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
        where.append("c.region_code = %s")
        params.append(region)
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
    order_col = _SORT_COLUMNS.get(sort, "c.id")

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            f"SELECT count(*) AS total FROM course c "
            f"JOIN course_route cr ON c.id = cr.course_id {where_sql}",
            params,
        )
        total = cur.fetchone()["total"]

        cur.execute(
            f"""
            SELECT c.id, c.course_title AS title, c.start_address, c.image_url, c.region_code
            FROM course c
            JOIN course_route cr ON c.id = cr.course_id
            {where_sql}
            ORDER BY {order_col}
            LIMIT %s OFFSET %s
            """,
            [*params, size, (page - 1) * size],
        )
        rows = cur.fetchall()

    if rows:
        ids = [r["id"] for r in rows]
        routes = _fetch_routes(conn, ids)
        paths = _fetch_simplified_paths(conn, ids)
        for r in rows:
            r["routes"] = routes.get(r["id"], [])
            r["path_trail"] = paths.get((r["id"], "trail"), [])
            r["path_bicycle"] = paths.get((r["id"], "bicycle"), [])

    return total, rows


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
    """'10-30' → (10, 30), '30-' → (30, None), '-10' → (None, 10)."""
    if "-" not in distance:
        return None, None
    lo, _, hi = distance.partition("-")
    min_d = float(lo) if lo.strip() else None
    max_d = float(hi) if hi.strip() else None
    return min_d, max_d


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
