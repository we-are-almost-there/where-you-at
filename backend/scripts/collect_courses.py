"""
두루누비 코스 수집 스크립트.

두루누비 courseList API를 직접 호출해 코스 정보를 가져온다.
대상 코스는 mock 데이터(backend/mock/data/courses.py)의 crs_idx 목록으로 한정한다. 나중에 확장할 예정

course          ← 코스 공통 (제목, 설명, 지역, 이미지, 주소)
course_route    ← 주행방식별 거리, 시간, 난이도, 출발좌표, bounds (도보=두루누비, 자전거=OSRM)
course_waypoint ← 주행방식별 좌표 (도보=GPX, 자전거=OSRM)
"""
import sys
import os
import time

_BACKEND = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, _BACKEND)
sys.path.insert(0, os.path.join(_BACKEND, "mock"))

from data.courses import COURSES  # noqa: E402  대상 crs_idx 목록 소스
from app.db.supabase import get_db_connection
from app.crud.course import upsert_course, upsert_route, upsert_waypoints
from app.crud.region import get_region_code
from app.services.durunubi import fetch_all_courses, fetch_gpx
from app.services.gpx_parser import parse
from app.services.osrm import fetch_bicycle_route
from app.services.kakao import coord2address
from app.services.tour_api import find_course_image

TRIAL_LIMIT = 3  # --all 없이 실행할 때의 기본 수집 개수

# 두루누비 crsLevel(1/2/3) → 도보 난이도
_LEVEL_MAP = {"1": "easy", "2": "medium", "3": "hard"}
# 자전거 평균 속도(km/h) — 예상 소요시간 계산용
_BICYCLE_SPEED_KMH = 18
# 자전거 거리가 도보의 이 배수 이상이면 도로 우회가 과해 자전거 부적합 → 제외
_BICYCLE_MAX_RATIO = 3


def _course_row(api: dict) -> dict:
    """두루누비 API 응답 → course 공통 컬럼 dict (좌표, 이미지, 주소는 별도로 채움)."""
    return {
        "source_id": api["crsIdx"],
        "course_title": api["crsKorNm"],
        "description": api.get("crsContents"),
        "start_address": None,
        "region_code": None,
        "image_url": None,
        "original_gpx_url": api.get("gpxpath"),
    }


def _geo(waypoints: list[dict]) -> dict:
    """waypoints → 출발좌표 + bounds dict."""
    lats = [w["lat"] for w in waypoints]
    lngs = [w["lng"] for w in waypoints]
    return {
        "start_lat": waypoints[0]["lat"],
        "start_lng": waypoints[0]["lng"],
        "min_lat": min(lats),
        "max_lat": max(lats),
        "min_lng": min(lngs),
        "max_lng": max(lngs),
    }


def collect(limit: int) -> None:
    conn = get_db_connection()

    print("두루누비 전체 코스 조회 중")
    all_courses = fetch_all_courses()
    print(f"  {len(all_courses)}개 코스 수신\n")

    targets = [c["crs_idx"] for c in COURSES[:limit]]

    for i, crs_idx in enumerate(targets, 1):
        api = all_courses.get(crs_idx)
        if not api:
            print(f"[{i}/{limit}] {crs_idx} - API 응답에 없음, 건너뜀")
            continue

        print(f"[{i}/{limit}] {api['crsKorNm']}")

        # 1) 도보 GPX + 자전거 경로 확보
        trail_wps = []
        if api.get("gpxpath"):
            try:
                trail_wps = parse(fetch_gpx(api["gpxpath"]))
            except Exception as e:
                print(f"  GPX 다운로드 실패: {e}")
        bike_wps, bike_dist_m = fetch_bicycle_route(trail_wps) if trail_wps else ([], 0.0)

        # 2) course 공통
        row = _course_row(api)
        row["region_code"] = get_region_code(conn, api.get("sigun"))
        if trail_wps:
            try:
                row["start_address"] = coord2address(trail_wps[0]["lat"], trail_wps[0]["lng"])
            except Exception as e:
                print(f"  주소 변환 실패: {e}")
            row["image_url"] = find_course_image(trail_wps)
        course_id = upsert_course(conn, row)
        print(f"  course (id={course_id}, region={row['region_code']}, img={'O' if row['image_url'] else 'X'})")

        # 3) course_route + waypoint: 도보
        if trail_wps:
            trail_route = {
                "course_id": course_id,
                "route_type": "trail",
                "distance": float(api["crsDstnc"]) if api.get("crsDstnc") else 0,
                "estimated_time": int(api["crsTotlRqrmHour"]) if api.get("crsTotlRqrmHour") else None,
                "difficulty": _LEVEL_MAP.get(api.get("crsLevel")),
                **_geo(trail_wps),
            }
            upsert_route(conn, trail_route)
            upsert_waypoints(conn, course_id, trail_wps, route_type="trail")
            print(f"  trail: {trail_route['distance']}km / {trail_route['estimated_time']}분 / {len(trail_wps)}점")

        # 4) course_route + waypoint: 자전거
        # 자전거 거리가 도보의 _BICYCLE_MAX_RATIO 3배 이상이면 도로 우회가 과해 부적합 → 제외
        if bike_wps:
            bike_km = round(bike_dist_m / 1000, 1)
            trail_km = float(api["crsDstnc"]) if api.get("crsDstnc") else 0
            if trail_km and bike_km >= trail_km * _BICYCLE_MAX_RATIO:
                print(f"  bicycle 제외: {bike_km}km = 도보 {trail_km}km의 {round(bike_km / trail_km, 1)}배 (자전거 부적합)")
            else:
                bike_route = {
                    "course_id": course_id,
                    "route_type": "bicycle",
                    "distance": bike_km,
                    "estimated_time": round(bike_km / _BICYCLE_SPEED_KMH * 60),
                    "difficulty": None,
                    **_geo(bike_wps),
                }
                upsert_route(conn, bike_route)
                upsert_waypoints(conn, course_id, bike_wps, route_type="bicycle")
                print(f"  bicycle: {bike_route['distance']}km / {bike_route['estimated_time']}분 / {len(bike_wps)}점")

        if i < limit:
            time.sleep(1)

    conn.close()
    print(f"\n[완료] {limit}개 코스 수집")


def fill_images(limit: int) -> None:
    """기존 GPX, 경로 데이터는 건드리지 않고 이미지만 채운다."""
    conn = get_db_connection()

    print("두루누비 전체 코스 조회 중")
    all_courses = fetch_all_courses()

    targets = [c["crs_idx"] for c in COURSES[:limit]]

    for i, crs_idx in enumerate(targets, 1):
        api = all_courses.get(crs_idx)
        if not api:
            continue

        trail_wps = []
        if api.get("gpxpath"):
            try:
                trail_wps = parse(fetch_gpx(api["gpxpath"]))
            except Exception:
                pass

        image_url = find_course_image(trail_wps) if trail_wps else None
        if image_url:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE course SET image_url = %s WHERE source_id = %s",
                    (image_url, crs_idx),
                )
            conn.commit()
        print(f"[{i}/{limit}] {api['crsKorNm']} → {'O' if image_url else 'X'}")

        if i < limit:
            time.sleep(0.5)

    conn.close()
    print(f"\n[완료] {limit}개 이미지 업데이트")


def clean(limit: int) -> None:
    """시범 적재한 데이터를 source_id 기준으로 삭제한다.
    course_route / course_waypoint는 ON DELETE CASCADE로 자동 삭제된다.
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
    elif "--images" in args:
        fill_images(len(COURSES))
    elif "--all" in args:
        collect(len(COURSES))
    else:
        collect(TRIAL_LIMIT)
