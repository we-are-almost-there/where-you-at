"""
두루누비 코스 수집 스크립트.

두루누비 courseList API를 직접 호출해 코스 정보를 가져온다.
--all 이면 API의 모든 코스를, 아니면 mock 데이터(backend/mock/data/courses.py)의
crs_idx 목록(시범 TRIAL_LIMIT개)을 적재한다.

course          ← 코스 공통 (제목, 설명, 지역, 이미지, 주소)
course_route    ← 주행방식별 거리, 시간, 난이도, 출발좌표, bounds (도보=두루누비, 자전거=OSRM)
course_waypoint ← 주행방식별 좌표 (도보=GPX, 자전거=OSRM)

사용:
  python scripts/collect_courses.py --reset           # ⚠️ course 전체 삭제 + id 1부터 초기화(파괴적)
  python scripts/collect_courses.py --all [--resume]  # API 전체 코스 적재(--resume: 이미 적재된 건 건너뜀)
  python scripts/collect_courses.py --clean           # 시범 코스 삭제
  python scripts/collect_courses.py --images [--start N --count M]  # DB 적재분 이미지 재적재(중복 회피+관광 타입 필터, 배치 가능)
  python scripts/collect_courses.py --backfill-images # image_url NULL인 코스만 백필(쿼터 리셋 후 재실행 가능)
"""
import sys
import os
import csv
import re
import time

_BACKEND = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, _BACKEND)
sys.path.insert(0, os.path.join(_BACKEND, "mock"))

from data.courses import COURSES  # noqa: E402  시범 대상 crs_idx 목록 소스
from app.db.supabase import get_db_connection
from app.crud.course import upsert_course, upsert_route, upsert_waypoints, delete_route
from app.crud.region import get_region_code, region_code_from_address
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
_BICYCLE_MAX_RATIO = 2
# 실패로 비면 안 되는(채워야 하는) course 열 — NULL 리포트 대상
_REPORT_COLUMNS = ["description", "start_address", "region_code", "image_url", "original_gpx_url"]
_NULL_REPORT_PATH = os.path.join(_BACKEND, "scripts", "null_report_durunubi.csv")


def _clean_description(text: str | None) -> str | None:
    """crsContents가 '.'·'-'·공백처럼 한글/영문/숫자 없는 placeholder면 설명이 아니므로 None으로."""
    if not text:
        return None
    t = text.strip()
    if not re.search(r"[0-9A-Za-z가-힣]", t):
        return None
    return t


def _course_row(api: dict) -> dict:
    """두루누비 API 응답 → course 공통 컬럼 dict (좌표, 이미지, 주소는 별도로 채움)."""
    return {
        "source_id": api["crsIdx"],
        "course_title": api["crsKorNm"],
        "description": _clean_description(api.get("crsContents")),
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


def _existing_source_ids(conn) -> set:
    """이미 DB에 적재된 source_id 집합 (--resume 이어적재용)."""
    with conn.cursor() as cur:
        cur.execute("SELECT source_id FROM course")
        return {r[0] for r in cur.fetchall()}


def _write_null_report(rows: list[dict], path: str) -> None:
    """실패로 열이 빈 코스 목록을 CSV로 남긴다(엑셀용 utf-8-sig)."""
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["source_id", "course_title", "null_columns"])
        w.writeheader()
        w.writerows(rows)


def reset() -> None:
    """course 전체 삭제 + id 시퀀스 초기화. course_route/waypoint는 CASCADE로 함께 비워진다."""
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("TRUNCATE course RESTART IDENTITY CASCADE")
    conn.commit()
    conn.close()
    print("[리셋 완료] course 전체 삭제 + id 1부터 초기화")


def collect(targets: list[str] | None = None, resume: bool = False) -> None:
    conn = get_db_connection()

    print("두루누비 전체 코스 조회 중")
    all_courses = fetch_all_courses()
    print(f"  {len(all_courses)}개 코스 수신\n")

    if targets is None:  # --all: API 전체 코스
        targets = list(all_courses.keys())
    existing = _existing_source_ids(conn) if resume else set()

    total = len(targets)
    null_rows: list[dict] = []
    done = skipped = 0

    for i, crs_idx in enumerate(targets, 1):
        api = all_courses.get(crs_idx)
        if not api:
            print(f"[{i}/{total}] {crs_idx} - API 응답에 없음, 건너뜀")
            continue
        if resume and crs_idx in existing:
            skipped += 1
            print(f"[{i}/{total}] {api['crsKorNm']} - 이미 적재됨, 건너뜀")
            continue

        print(f"[{i}/{total}] {api['crsKorNm']}")

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
        if trail_wps:
            try:
                row["start_address"] = coord2address(trail_wps[0]["lat"], trail_wps[0]["lng"])
            except Exception as e:
                print(f"  주소 변환 실패: {e}")
            row["image_url"] = find_course_image(trail_wps)
        # region_code: 실제 출발지 주소 기반이 정확(두루누비 sigun은 긴 코스에서 관할 시군을
        # 대표로 달아 출발지와 어긋난다). 주소 역산 실패 시에만 sigun으로 폴백.
        row["region_code"] = region_code_from_address(conn, row["start_address"]) or get_region_code(
            conn, api.get("sigun")
        )
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
        # 자전거 거리가 도보의 _BICYCLE_MAX_RATIO(2배) 이상이면 도로 우회가 과해 부적합.
        # 부적합·미생성 시엔 이전 실행에서 남았을 자전거 데이터를 삭제한다.
        bike_km = round(bike_dist_m / 1000, 1) if bike_wps else 0
        trail_km = float(api["crsDstnc"]) if api.get("crsDstnc") else 0
        if bike_wps and not (trail_km and bike_km >= trail_km * _BICYCLE_MAX_RATIO):
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
        else:
            delete_route(conn, course_id, "bicycle")
            if bike_wps:
                print(f"  bicycle 제외: {bike_km}km = 도보 {trail_km}km의 {round(bike_km / trail_km, 1)}배 (부적합, 기존 자전거 데이터 삭제)")

        # 5) NULL 리포트 — 실패로 빈 열 기록(의도된 NULL은 대상 아님)
        missing = [c for c in _REPORT_COLUMNS if not row.get(c)]
        if not trail_wps:
            missing.append("(GPX 없음)")
        if missing:
            null_rows.append({
                "source_id": crs_idx,
                "course_title": api["crsKorNm"],
                "null_columns": " | ".join(missing),
            })

        done += 1
        if i < total:
            time.sleep(1)

    conn.close()
    _write_null_report(null_rows, _NULL_REPORT_PATH)
    print(f"\n[완료] 적재 {done} / 건너뜀 {skipped} / NULL 유발 {len(null_rows)}건")
    print(f"[NULL 리포트] {_NULL_REPORT_PATH}")


def _existing_images(conn, exclude_ids: set[int]) -> set[str]:
    """이미 DB에 저장된 image_url 집합(중복 방지 기준). 이번 배치 대상은 제외해
    자기 자신의 기존 이미지 때문에 재선정이 막히지 않게 한다."""
    with conn.cursor() as cur:
        cur.execute("SELECT id, image_url FROM course WHERE image_url IS NOT NULL")
        rows = cur.fetchall()
    return {img for cid, img in rows if cid not in exclude_ids}


def _trail_waypoints(conn, course_id: int) -> list[dict]:
    """DB에 적재된 도보 경로 좌표(이미지 선정용). 두루누비 GPX 재다운로드가 불필요."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT lat, lng FROM course_waypoint "
            "WHERE course_id = %s AND route_type = 'trail' ORDER BY sequence_order",
            (course_id,),
        )
        return [{"lat": float(la), "lng": float(ln)} for la, ln in cur.fetchall()]


def fill_images(start: int, count: int) -> None:
    """GPX·경로는 건드리지 않고 course.image_url만 다시 채운다.

    수집 대상 목록(COURSES 30개)이 아니라 **DB에 적재된 코스 전체**를 id 순으로 처리한다.
    [start:start+count] 슬라이스로 배치 실행할 수 있고(count<0이면 start부터 끝까지),
    중복 방지(dedup)는 DB 기준이라 배치를 나눠 돌려도 누적된다.
    경로 좌표는 DB에서 읽으므로 두루누비 재요청이 없어 빠르다.
    """
    conn = get_db_connection()

    with conn.cursor() as cur:
        cur.execute("SELECT id, course_title FROM course ORDER BY id")
        all_rows = cur.fetchall()

    batch = all_rows[start:] if count < 0 else all_rows[start:start + count]
    batch_ids = {cid for cid, _ in batch}
    used = _existing_images(conn, batch_ids)  # 다른 코스가 이미 쓰는 이미지
    total = len(batch)
    print(f"대상 {total}개 (DB {len(all_rows)}개 중 index {start}~{start + total})\n")

    for i, (course_id, title) in enumerate(batch, 1):
        wps = _trail_waypoints(conn, course_id)
        image_url = find_course_image(wps, used=used) if len(wps) >= 2 else None
        if image_url:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE course SET image_url = %s WHERE id = %s",
                    (image_url, course_id),
                )
            conn.commit()
            used.add(image_url)  # 다음 코스가 같은 사진을 피하도록
        print(f"[{start + i}/{start + total}] {title} → {'O' if image_url else 'X'}")

        if i < total:
            time.sleep(0.5)

    conn.close()
    print(f"\n[완료] index {start}~{start + total} 이미지 업데이트")


def backfill_images() -> None:
    """image_url이 NULL인 코스를, 이미 저장된 waypoint 좌표로 대표 이미지를 찾아 채운다.

    두루누비·국토종주 공통(DB 좌표 사용 → GPX/CSV 재수집 불필요).
    TourAPI 쿼터가 소진되면 거기까지만 채워지므로 쿼터 리셋 후 재실행하면 남은 것만 이어서 채운다.
    """
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT id, course_title FROM course WHERE image_url IS NULL ORDER BY id")
        targets = cur.fetchall()
    print(f"이미지 없는 코스 {len(targets)}개")

    filled = 0
    for i, (cid, title) in enumerate(targets, 1):
        with conn.cursor() as cur:
            cur.execute(
                "SELECT lat, lng FROM course_waypoint WHERE course_id = %s ORDER BY route_type, sequence_order",
                (cid,),
            )
            wps = [{"lat": r[0], "lng": r[1]} for r in cur.fetchall()]
        if not wps:
            print(f"[{i}/{len(targets)}] {title} - 좌표 없음, 건너뜀")
            continue
        img = find_course_image(wps)
        if img:
            with conn.cursor() as cur:
                cur.execute("UPDATE course SET image_url = %s WHERE id = %s", (img, cid))
            conn.commit()
            filled += 1
        print(f"[{i}/{len(targets)}] {title} → {'O' if img else 'X'}")
        time.sleep(0.3)

    conn.close()
    print(f"\n[완료] 이미지 채움 {filled} / 대상 {len(targets)}")


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


def _arg_int(args: list[str], flag: str, default: int) -> int:
    """`--flag N` 형태에서 정수 값을 읽는다. 없으면 default."""
    if flag in args:
        idx = args.index(flag)
        if idx + 1 < len(args):
            return int(args[idx + 1])
    return default


if __name__ == "__main__":
    args = sys.argv[1:]

    if "--reset" in args:
        reset()
    elif "--clean" in args:
        clean(TRIAL_LIMIT)
    elif "--images" in args:
        # DB 적재분 전체 이미지 재적재(중복 회피 + 관광 타입 필터). 배치: --start N --count M
        start = _arg_int(args, "--start", 0)
        count = _arg_int(args, "--count", -1)  # -1 = start부터 끝까지
        fill_images(start, count)
    elif "--backfill-images" in args:
        # image_url이 NULL인 코스만 채움(재적재 아님)
        backfill_images()
    elif "--all" in args:
        collect(resume="--resume" in args)
    else:
        collect([c["crs_idx"] for c in COURSES[:TRIAL_LIMIT]], resume="--resume" in args)
