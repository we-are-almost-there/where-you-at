"""
race 테이블 조회 CRUD 함수

course/course.py 패턴과 동일하게 psycopg2 raw SQL + RealDictCursor 사용.
"""

from typing import Optional
from psycopg2.extras import RealDictCursor


def get_races(
    conn,
    region_code: Optional[str] = None,
    event_type: Optional[str] = None,
    upcoming_only: bool = True,
    page: int = 1,
    per_page: int = 20,
):
    """조건에 맞는 대회 목록 조회 (페이지네이션). (rows, total_count) 반환."""
    conditions = []
    params = {}

    if region_code:
        conditions.append("region_code = %(region_code)s")
        params["region_code"] = region_code

    if event_type:
        conditions.append("event_type = %(event_type)s")
        params["event_type"] = event_type

    if upcoming_only:
        # end_date가 있으면 end_date 기준, 없으면(하루짜리 대회) start_date 기준
        conditions.append(
            "(end_date >= CURRENT_DATE OR (end_date IS NULL AND start_date >= CURRENT_DATE))"
        )

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    offset = (page - 1) * per_page
    params["limit"] = per_page
    params["offset"] = offset

    query = f"""
        SELECT event_id, source, race_title, event_type,
               start_date, end_date, location_name,
               map_x, map_y, region_code, contact, homepage_url
        FROM race
        {where_clause}
        ORDER BY start_date ASC
        LIMIT %(limit)s OFFSET %(offset)s
    """
    count_query = f"SELECT COUNT(*) AS total FROM race {where_clause}"

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(count_query, params)
        total = cur.fetchone()["total"]

        cur.execute(query, params)
        rows = cur.fetchall()

    return rows, total


def get_race_by_id(conn, event_id: int):
    """단일 대회 상세 조회. 없으면 None."""
    query = """
        SELECT event_id, source, race_title, event_type,
               start_date, end_date, location_name,
               map_x, map_y, region_code, contact, homepage_url,
               created_at, synced_at
        FROM race
        WHERE event_id = %(event_id)s
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, {"event_id": event_id})
        return cur.fetchone()


def get_races_by_course(conn, course_id: int, upcoming_only: bool = True):
    """코스의 region_code와 일치하는 대회 목록 조회 (지역 기반 매칭).

    course 테이블에 region_code 인덱스가 없다면 조인 성능을 위해
    `create index idx_course_region on course (region_code);` 추가를 권장.
    """
    conditions = ["r.region_code = c.region_code", "c.id = %(course_id)s"]
    if upcoming_only:
        conditions.append(
            "(r.end_date >= CURRENT_DATE OR (r.end_date IS NULL AND r.start_date >= CURRENT_DATE))"
        )

    query = f"""
        SELECT r.event_id, r.source, r.race_title, r.event_type,
               r.start_date, r.end_date, r.location_name,
               r.map_x, r.map_y, r.region_code, r.contact, r.homepage_url
        FROM race r
        JOIN course c ON c.region_code IS NOT NULL
        WHERE {' AND '.join(conditions)}
        ORDER BY r.start_date ASC
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, {"course_id": course_id})
        return cur.fetchall()