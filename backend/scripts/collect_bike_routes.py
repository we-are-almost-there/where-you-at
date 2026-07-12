"""
국토종주 자전거길 노선좌표 CSV → 자전거 전용 코스 적재 스크립트.

행정안전부 '국토종주 자전거길 노선좌표' CSV(노선구분별 좌표열)를 읽어
도보 없이 자전거(route_type='bicycle')만 있는 독립 코스로 적재한다.

CSV 컬럼: 순번, 노선구분, 위도(LINE_XP), 경도(LINE_YP) — 좌표계 EPSG:4326.

course          ← 노선구분 1개당 코스 1개 (source_id='gukto-{노선구분}')
course_route    ← 자전거 경로 (거리=좌표 인접거리 Haversine 누적, 난이도 없음)
course_waypoint ← 노선 좌표 (순번 정렬)

사용:
    python scripts/collect_bike_routes.py --preview [out.csv] --csv "<좌표 CSV>"  # 관광지·설명 미리보기(DB 미변경)
    python scripts/collect_bike_routes.py --csv "<좌표 CSV>" [--desc <미리보기.csv>]  # 적재
    python scripts/collect_bike_routes.py --clean                                     # 국토종주 코스 전체 삭제

설명(description)은 TourAPI로 뽑은 주변 대표 관광지로 --preview에서 문장을 만들어 CSV로 내보낸다.
검토(수정) 후 그 CSV를 --desc로 넘기면 그 문장을 그대로 적재한다(적재 시 TourAPI 재호출 없음).
"""
import sys
import os
import csv
import math

_BACKEND = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, _BACKEND)

from app.db.supabase import get_db_connection  # noqa: E402
from app.crud.course import upsert_course, upsert_route, upsert_waypoints  # noqa: E402
from app.crud.region import region_code_from_address  # noqa: E402
from app.services.tour_api import top_attractions, find_course_image  # noqa: E402
from app.services.kakao import coord2address  # noqa: E402

# 자전거 평균 속도(km/h) — 예상 소요시간 계산용 (collect_courses.py와 동일 가정)
_BICYCLE_SPEED_KMH = 18
# source_id 네임스페이스: 두루누비 crsIdx와 충돌하지 않도록 접두사를 붙인다.
_SOURCE_PREFIX = "gukto-"
# --csv 미지정 시 기본 경로 (팀 공유용으로 여기 두거나 --csv로 직접 지정)
_DEFAULT_CSV = os.path.join(_BACKEND, "scripts", "data", "gukto_bike_routes.csv")

# ROAD_SN(노선구분) → 노선명 (행안부 '노선정보 코드북' 기준).
# 결번 22·37·38·40은 미사용 노선이라 좌표 CSV에 없다.
_ROUTE_NAMES = {
    1: "아라자전거길", 2: "한강종주자전거길", 3: "남한강자전거길", 4: "새재자전거길",
    5: "낙동강자전거길", 6: "금강자전거길", 7: "영산강자전거길", 8: "북한강자전거길",
    9: "섬진강자전거길", 10: "오천자전거길", 11: "동해안(강원)자전거길", 12: "동해안(경북)자전거길",
    13: "제주환상자전거길", 14: "강릉 경포호 산소길", 15: "화천 파로호 100리 산소길",
    16: "옹진 덕적도 자전거길", 17: "파주 DMZ 자전거길", 18: "옥천 향수 100리길",
    19: "정읍 정읍천 자전거길", 20: "신안 증도 자전거섬", 21: "경주 역사탐방 자전거길",
    23: "제주 해맞이 해안로", 24: "강화군(지붕없는 박물관) 자전거길",
    25: "옹진의 아름다운 시시모도 자전거 여행길", 26: "군산 고군산도 자전거길",
    27: "여수 금오도 해안도로 자전거길", 28: "고흥군(거금도~소록도) 자전거길",
    29: "완도 수목원 자전거길", 30: "느림의 미학 완도군 청산도 자전거길",
    31: "항상 새로운 섬 완도군 생일도 자전거길", 32: "쉬미향~청용삼거리 자전거길(진도군)",
    33: "신안군(입해도) 자전거길", 34: "신안군(증도) 자전거길", 35: "신안군(임자도) 자전거길",
    36: "신안군(자은, 임태도) 자전거길", 39: "신안군(흑산도) 자전거길",
    41: "울릉도 꿈이 있는 자전거길", 42: "환상의 사천시 신수도 바다 자전거길",
    43: "경남 남해(남해대교~남해읍 선소) 자전거길", 44: "제주도(구좌읍 해맞이 해안로) 자전거길",
    45: "제주 환상 자전거길(오조리~성산리)", 46: "제주도(상모리~사계리) 자전거길",
}

# 실패로 비면 안 되는 열 — NULL 리포트 대상 (gpx·difficulty는 국토종주에서 의도된 NULL이라 제외)
_REPORT_COLUMNS = ["description", "start_address", "region_code", "image_url"]
_NULL_REPORT_PATH = os.path.join(_BACKEND, "scripts", "null_report_gukto.csv")


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.asin(math.sqrt(a))


def _read_routes(csv_path: str) -> tuple[dict[str, list[dict]], int]:
    """CSV → {노선구분: [{seq, lat, lng}, ...]} (순번 정렬). 파싱 실패 행 수도 반환."""
    routes: dict[str, list[dict]] = {}
    skipped = 0
    with open(csv_path, encoding="cp949", newline="") as f:
        reader = csv.reader(f)
        next(reader, None)  # 헤더
        for row in reader:
            try:
                seq = int(row[0])
                rid = row[1].strip()
                lat = float(row[2])
                lng = float(row[3])
            except (ValueError, IndexError):
                skipped += 1  # 위도 셀이 깨진 소수 행 등 → 스킵
                continue
            routes.setdefault(rid, []).append({"seq": seq, "lat": lat, "lng": lng})
    for pts in routes.values():
        pts.sort(key=lambda p: p["seq"])
    return routes, skipped


# 좌표 간격이 이 값(km)을 넘으면 끊긴 구간(지선 연결 pen-up)으로 보고 거리 합산에서 제외.
# 일부 노선구분은 떨어진 구간들이 이어붙어 있어, 그대로 합치면 거리가 크게 부풀려진다.
_MAX_GAP_KM = 3.0


def _route_distance_km(pts: list[dict]) -> float:
    total = 0.0
    for a, b in zip(pts, pts[1:]):
        d = _haversine_km(a["lat"], a["lng"], b["lat"], b["lng"])
        if d <= _MAX_GAP_KM:  # 구간 단절 점프는 제외
            total += d
    return total


def _description(dist_km: float, spots: list[str]) -> str:
    """거리 + 주변 관광지로 설명 문장을 만든다. 관광지명은 사실, 문장은 자체 조합.
    거리는 좌표 기반 계산값이라 정밀 표기(소수점) 대신 '약 N km'로 부드럽게 쓴다.
    """
    text = f"약 {round(dist_km)}km의 국토종주 자전거길 코스입니다."
    if spots:
        text += f" 주변에 {', '.join(spots)} 등의 관광지가 있습니다."
    return text


def preview(csv_path: str, out_path: str) -> None:
    """DB를 건드리지 않고 노선별 관광지·설명문을 CSV로 내보낸다(검토용)."""
    routes, skipped = _read_routes(csv_path)
    print(f"CSV 파싱: {len(routes)}개 노선 / 스킵 {skipped}행\n")

    rows = []
    for rid in sorted(routes, key=int):
        pts = routes[rid]
        dist_km = round(_route_distance_km(pts), 1)
        spots = top_attractions([{"lat": p["lat"], "lng": p["lng"]} for p in pts], n=4)
        title = _ROUTE_NAMES.get(int(rid), f"국토종주 자전거길 {rid}호선")
        rows.append({
            "road_sn": rid,
            "source_id": f"{_SOURCE_PREFIX}{rid}",
            "course_title": title,
            "distance_km": dist_km,
            "estimated_min": round(dist_km / _BICYCLE_SPEED_KMH * 60),
            "num_points": len(pts),
            "attractions": " | ".join(spots),
            "description": _description(dist_km, spots),
        })
        print(f"  {rid:>2} {title}: 관광지 {len(spots)}개")

    fields = ["road_sn", "source_id", "course_title", "distance_km",
                "estimated_min", "num_points", "attractions", "description"]
    # Excel 한글 깨짐 방지용 utf-8-sig(BOM). description 열을 직접 수정 후 --desc로 넘기면 된다.
    with open(out_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"\n[미리보기 완료] {out_path}")


def _read_csv_dicts(path: str) -> list[dict]:
    for enc in ("utf-8-sig", "cp949"):
        try:
            with open(path, encoding=enc, newline="") as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    raise RuntimeError(f"인코딩 판별 실패: {path}")


def _write_null_report(rows: list[dict], path: str) -> None:
    """실패로 열이 빈 코스 목록을 CSV로 남긴다(엑셀용 utf-8-sig)."""
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["source_id", "course_title", "null_columns"])
        w.writeheader()
        w.writerows(rows)


def _load_descriptions(desc_path: str) -> dict[str, str]:
    """미리보기 CSV(source_id, description)에서 설명문을 읽어 매핑으로 반환한다."""
    descs: dict[str, str] = {}
    for row in _read_csv_dicts(desc_path):
        sid = (row.get("source_id") or "").strip()
        desc = (row.get("description") or "").strip()
        if sid and desc:
            descs[sid] = desc
    return descs


def load(csv_path: str, desc_path: str | None = None) -> None:
    routes, skipped = _read_routes(csv_path)
    descs = _load_descriptions(desc_path) if desc_path else {}
    print(f"CSV 파싱: {len(routes)}개 노선 / 스킵 {skipped}행"
            f"{f' / 설명 {len(descs)}건' if descs else ''}\n")

    conn = get_db_connection()
    null_rows: list[dict] = []
    for rid in sorted(routes, key=int):
        pts = routes[rid]
        lats = [p["lat"] for p in pts]
        lngs = [p["lng"] for p in pts]
        dist_km = round(_route_distance_km(pts), 1)
        wps = [{"lat": p["lat"], "lng": p["lng"]} for p in pts]

        # 열 채우기(기존 서비스 재사용): 시작점 주소 → 지역, 경로 주변 대표 이미지
        try:
            start_address = coord2address(pts[0]["lat"], pts[0]["lng"])
        except Exception as e:
            print(f"  주소 변환 실패: {e}")
            start_address = None
        title = _ROUTE_NAMES.get(int(rid), f"국토종주 자전거길 {rid}호선")
        course = {
            "source_id": f"{_SOURCE_PREFIX}{rid}",
            "course_title": title,
            # --desc 미리보기 CSV가 있으면 그 설명문, 없으면 NULL
            "description": descs.get(f"{_SOURCE_PREFIX}{rid}"),
            "start_address": start_address,
            "region_code": region_code_from_address(conn, start_address),  # 시작점 기준 대표 지역
            "image_url": find_course_image(wps),
            "original_gpx_url": None,  # CSV 출처라 GPX 없음(의도된 NULL)
        }
        course_id = upsert_course(conn, course)

        route = {
            "course_id": course_id,
            "route_type": "bicycle",
            "distance": dist_km,
            "estimated_time": round(dist_km / _BICYCLE_SPEED_KMH * 60),
            "difficulty": None,
            "start_lat": pts[0]["lat"],
            "start_lng": pts[0]["lng"],
            "min_lat": min(lats),
            "max_lat": max(lats),
            "min_lng": min(lngs),
            "max_lng": max(lngs),
        }
        upsert_route(conn, route)

        waypoints = [
            {"lat": p["lat"], "lng": p["lng"], "sequence_order": i}
            for i, p in enumerate(pts)
        ]
        upsert_waypoints(conn, course_id, waypoints, route_type="bicycle")
        print(f"  {course['source_id']} (id={course_id}): {dist_km}km / {len(waypoints)}점 "
                f"/ region={course['region_code']} / img={'O' if course['image_url'] else 'X'}")

        # NULL 리포트 — 실패로 빈 열 기록(gpx·difficulty 등 의도된 NULL은 대상 아님)
        missing = [c for c in _REPORT_COLUMNS if not course.get(c)]
        if missing:
            null_rows.append({
                "source_id": course["source_id"],
                "course_title": title,
                "null_columns": " | ".join(missing),
            })

    conn.close()
    _write_null_report(null_rows, _NULL_REPORT_PATH)
    print(f"\n[완료] {len(routes)}개 국토종주 자전거 코스 적재 / NULL 유발 {len(null_rows)}건")
    print(f"[NULL 리포트] {_NULL_REPORT_PATH}")


def clean() -> None:
    """적재한 국토종주 코스를 source_id 접두사 기준으로 삭제한다.
    course_route / course_waypoint는 ON DELETE CASCADE로 자동 삭제된다.
    """
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("DELETE FROM course WHERE source_id LIKE %s", (f"{_SOURCE_PREFIX}%",))
    conn.commit()
    conn.close()
    print(f"[삭제 완료] source_id '{_SOURCE_PREFIX}*' 코스")


if __name__ == "__main__":
    args = sys.argv[1:]

    def _opt(flag: str, default: str | None = None) -> str | None:
        """--flag 다음 값을 반환(다음 토큰이 또 다른 --옵션이면 값 없음)."""
        if flag in args:
            i = args.index(flag)
            if i + 1 < len(args) and not args[i + 1].startswith("--"):
                return args[i + 1]
        return default

    if "--clean" in args:
        clean()
    else:
        csv_path = _opt("--csv", _DEFAULT_CSV)
        if not os.path.exists(csv_path):
            sys.exit(f"CSV를 찾을 수 없습니다: {csv_path}\n--csv \"<경로>\"로 지정하세요.")
        if "--preview" in args:
            out = _opt("--preview") or os.path.join(
                os.path.dirname(csv_path), "국토종주_설명_미리보기.csv"
            )
            preview(csv_path, out)
        else:
            load(csv_path, _opt("--desc"))
