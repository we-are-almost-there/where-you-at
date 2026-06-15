from psycopg2.extras import execute_values

_WAYPOINT_BATCH = 500

_UPSERT_COURSE_SQL = """
INSERT INTO course (
    source_id, course_title, description, type, distance, difficulty,
    start_address, estimated_time, region_code, image_url, original_gpx_url,
    min_lat, max_lat, min_lng, max_lng
) VALUES (
    %(source_id)s, %(course_title)s, %(description)s, %(type)s, %(distance)s, %(difficulty)s,
    %(start_address)s, %(estimated_time)s, %(region_code)s, %(image_url)s, %(original_gpx_url)s,
    %(min_lat)s, %(max_lat)s, %(min_lng)s, %(max_lng)s
)
ON CONFLICT (source_id) DO UPDATE SET
    course_title     = EXCLUDED.course_title,
    description      = EXCLUDED.description,
    type             = EXCLUDED.type,
    distance         = EXCLUDED.distance,
    difficulty       = EXCLUDED.difficulty,
    start_address    = EXCLUDED.start_address,
    estimated_time   = EXCLUDED.estimated_time,
    region_code      = EXCLUDED.region_code,
    image_url        = EXCLUDED.image_url,
    original_gpx_url = EXCLUDED.original_gpx_url,
    min_lat          = EXCLUDED.min_lat,
    max_lat          = EXCLUDED.max_lat,
    min_lng          = EXCLUDED.min_lng,
    max_lng          = EXCLUDED.max_lng,
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


def upsert_waypoints(conn, course_id: int, waypoints: list[dict]) -> None:
    """기존 waypoint를 삭제 후 새 좌표를 삽입한다.
    1,000개 이상의 waypoint를 안전하게 처리하기 위해 500개씩 배치 삽입한다.
    """
    rows = [
        (course_id, wp["lat"], wp["lng"], wp["sequence_order"])
        for wp in waypoints
    ]
    with conn.cursor() as cur:
        cur.execute("DELETE FROM course_waypoint WHERE course_id = %s", (course_id,))
        for i in range(0, len(rows), _WAYPOINT_BATCH):
            execute_values(
                cur,
                "INSERT INTO course_waypoint (course_id, lat, lng, sequence_order) VALUES %s",
                rows[i : i + _WAYPOINT_BATCH],
            )
    conn.commit()
