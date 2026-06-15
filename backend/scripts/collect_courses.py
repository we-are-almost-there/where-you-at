"""두루누비 코스 수집 스크립트.

Mock 데이터(backend/mock/data/courses.py)를 소스로 사용하여
Supabase course / course_waypoint 테이블에 적재한다.
두루누비 API 키로 하고 싶을 때 fetch_course_list()로 교체하고 키값 수정 필요

실행:
    cd backend
    python -m scripts.collect_courses           # 처음 3개만 시범 실행
    python -m scripts.collect_courses --all     # 전체 30개 수집
    python -m scripts.collect_courses --clean   # 시범 적재 데이터 삭제
"""
import sys
import os
import time

_BACKEND = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, _BACKEND)
sys.path.insert(0, os.path.join(_BACKEND, "mock"))

from data.courses import COURSES  # noqa: E402  mock 데이터 소스
from app.db.supabase import get_db_connection
from app.crud.course import upsert_course, upsert_waypoints
from app.services.durunubi import fetch_gpx
from app.services.gpx_parser import parse

TRIAL_LIMIT = 3  # --all 없이 실행할 때의 기본 수집 개수


def _to_db_row(c: dict) -> dict:
    """mock 코스 dict → course 테이블 컬럼 dict 변환."""
    return {
        "source_id": c["crs_idx"],
        "course_title": c["title"],
        "description": c.get("description"),
        "type": c["type"],
        "distance": c["distance"],
        "difficulty": c.get("difficulty"),
        "start_address": c.get("start_address"),
        "estimated_time": c.get("estimated_time"),
        "region_code": c.get("region_code"),
        "image_url": c.get("image_url"),
        "original_gpx_url": c.get("original_gpx_url"),
        "min_lat": c["bounds"]["min_lat"],
        "max_lat": c["bounds"]["max_lat"],
        "min_lng": c["bounds"]["min_lng"],
        "max_lng": c["bounds"]["max_lng"],
    }


def collect(limit: int) -> None:
    conn = get_db_connection()
    targets = COURSES[:limit]

    for i, course in enumerate(targets, 1):
        print(f"[{i}/{limit}] {course['title']}")

        course_id = upsert_course(conn, _to_db_row(course))
        print(f"  course UPSERT 완료 (id={course_id})")

        gpx_url = course.get("original_gpx_url")
        if gpx_url:
            try:
                xml = fetch_gpx(gpx_url)
                waypoints = parse(xml)
                upsert_waypoints(conn, course_id, waypoints)
                print(f"  waypoints {len(waypoints)}개 적재 완료")
            except Exception as e:
                print(f"  GPX 처리 실패 (건너뜀): {e}")

        if i < limit:
            time.sleep(1)

    conn.close()
    print(f"\n[완료] {limit}개 코스 수집")


def clean(limit: int) -> None:
    """시범 적재한 데이터를 source_id 기준으로 삭제한다.
    course_waypoint는 ON DELETE CASCADE로 자동 삭제된다.
    """
    conn = get_db_connection()
    source_ids = [c["crs_idx"] for c in COURSES[:limit]]
    with conn.cursor() as cur:
        cur.execute("DELETE FROM course WHERE source_id = ANY(%s)", (source_ids,))
    conn.commit()
    conn.close()
    print(f"[삭제 완료] source_id {source_ids}")


if __name__ == "__main__":
    args = sys.argv[1:]

    if "--clean" in args:
        clean(TRIAL_LIMIT)
    elif "--all" in args:
        collect(len(COURSES))
    else:
        collect(TRIAL_LIMIT)
