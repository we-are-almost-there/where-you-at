"""
전국자전거대여소표준데이터 수집 -> bicycle_facility 테이블 적재

데이터셋: 15017319 (전국자전거대여소표준데이터)
엔드포인트: https://api.data.go.kr/openapi/tn_pubr_public_bcycl_lend_api

region_code는 region 테이블(region_code, name, sido, is_population_drop)을
미리 로드해서 주소(rdnmadr/lnmadr) 파싱 -> 시/도+시/군/구 매칭으로 채운다.

실행:
    python collect_bicycle_facility.py
"""

import hashlib
import os
import time
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.environ["DB_HOST"]
DB_PORT = os.environ.get("DB_PORT", "5432")
DB_NAME = os.environ["DB_NAME"]
DB_USER = os.environ["DB_USER"]
DB_PASSWORD = os.environ["DB_PASSWORD"]

SERVICE_URL = "https://api.data.go.kr/openapi/tn_pubr_public_bcycl_lend_api"
SERVICE_KEY = os.environ["BICYCLE_SERVICE_KEY"]  # 디코딩된 키 사용 권장

NUM_OF_ROWS = 1000
REQUEST_INTERVAL_SEC = 0.3

FACILITY_TYPE_MAP = {
    "유인대여소": "rental_staffed",
    "무인대여소": "rental_unmanned",
    "무인·유인대여소": "rental_mixed",
    "혼합": "rental_mixed",
}

ERROR_MESSAGES = {
    "00": "NORMAL_CODE",
    "01": "APPLICATION_ERROR",
    "02": "DB_ERROR",
    "03": "NODATA_ERROR",
    "04": "HTTP_ERROR",
    "05": "SERVICETIMEOUT_ERROR",
    "10": "INVALID_REQUEST_PARAMETER_ERROR",
    "11": "NO_MANDATORY_REQUEST_PARAMETERS_ERROR",
    "12": "NO_OPENAPI_SERVICE_ERROR",
    "20": "SERVICE_ACCESS_DENIED_ERROR",
    "21": "TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR",
    "22": "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR",
    "30": "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
    "31": "DEADLINE_HAS_EXPIRED_ERROR",
    "32": "UNREGISTERED_IP_ERROR",
    "33": "UNSIGNED_CALL_ERROR",
    "99": "UNKNOWN_ERROR",
}

# 주소에 실제로 등장하는 시/도 표기 -> region 테이블 sido 컬럼 표기 정규화
# (region 테이블의 sido가 실제 주소 표기와 다른 경우 여기에 추가)
SIDO_ALIAS = {
    "광주광역시": "전남광주통합특별시",
    "전라남도": "전남광주통합특별시",
    "전남": "전남광주통합특별시",
    "전라북도": "전북특별자치도",
    "전북": "전북특별자치도",
    "강원도": "강원특별자치도",
    "경기": "경기도",
}


def get_conn():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )


def load_region_lookup(cur) -> dict:
    """sido -> [(name, region_code), ...] (name 길이 내림차순 정렬)"""
    cur.execute("SELECT region_code, name, sido FROM region")
    lookup: dict = {}
    for row in cur.fetchall():
        lookup.setdefault(row["sido"], []).append((row["name"], row["region_code"]))
    for sido in lookup:
        lookup[sido].sort(key=lambda x: -len(x[0]))
    return lookup


# 인천 행정체제 개편(2026-07-01 시행) 특례:
# 표준데이터 API 주소는 아직 구 명칭(서구/중구/동구) 기준일 수 있어
# 법정동 이름으로 새 구를 판별한다.
GEOMDAN_GU_DONGS = {
    "오류동", "왕길동", "금곡동", "마전동",
    "당하동", "원당동", "불로동", "대곡동",
    # 개편 후(2026-07-01) "시천동"이라는 이름 자체가 아라뱃길 이북
    # 축소 구역만 지칭 (이남은 검암동으로 개명됨) -> 명시적으로 검단구 처리
    "시천동",
}
YEONGJONG_GU_DONGS = {
    "운서동", "중산동", "운남동", "운북동", "을왕동", "남북동", "무의동",
}


# 시/군을 생략하고 읍/면부터 시작하는 주소 -> 소속 시/군 매핑 (sido별로 스코프)
MYEON_SIGUNGU_ALIAS = {
    "강원특별자치도": {"죽왕면": "고성군"},
}


def resolve_incheon_special_case(gu: str, rest_after_gu: str) -> str | None:
    """서구/중구/동구 -> 검단구/서해구/제물포구/영종구 특례 매칭.
    법정동까지 정확히 못 가르는 경우(예: 아라뱃길 기준으로 쪼개진 시천동)는
    None을 반환해 상위에서 기본값으로 처리한다."""
    dong = rest_after_gu.split()[0] if rest_after_gu else ""

    if gu == "서구":
        if dong in GEOMDAN_GU_DONGS:
            return "검단구"
        return "서해구"  # 기본값: 나머지 서구 지역
    if gu in ("중구", "동구"):
        if dong in YEONGJONG_GU_DONGS:
            return "영종구"
        return "제물포구"  # 기본값: 육지 지역
    return None


def resolve_region_code(addr: str, lookup: dict) -> str | None:
    """주소 문자열에서 시/도 + 시/군/구를 추출해 region_code 매칭.
    "세종특별자치시어진동"처럼 시/도-동 사이에 공백이 없는 경우도 대응하기 위해
    토큰 분리 대신 prefix 매칭을 사용한다."""
    if not addr:
        return None
    addr = addr.strip()

    sido_prefixes = sorted(set(lookup.keys()) | set(SIDO_ALIAS.keys()), key=len, reverse=True)
    matched_prefix = next((p for p in sido_prefixes if addr.startswith(p)), None)
    if not matched_prefix:
        return None

    normalized_sido = SIDO_ALIAS.get(matched_prefix, matched_prefix)
    candidates = lookup.get(normalized_sido)
    if not candidates:
        return None

    rest = addr[len(matched_prefix):].strip()
    rest_tokens = rest.split()

    # 세종시처럼 name == sido인 경우 (시/도 자체가 하나의 행정구역)
    for name, code in candidates:
        if name == normalized_sido:
            return code

    # 인천 개편지역 특례 (서구/중구/동구는 이미 폐지/분할됨)
    if normalized_sido == "인천광역시" and rest_tokens and rest_tokens[0] in ("서구", "중구", "동구"):
        new_gu = resolve_incheon_special_case(rest_tokens[0], " ".join(rest_tokens[1:]))
        if new_gu:
            for name, code in candidates:
                if name == new_gu:
                    return code

    for name, code in candidates:
        if rest.startswith(name):
            return code

    # 시/군을 생략하고 읍/면부터 시작하는 주소 (예: "강원특별자치도 죽왕면 ...")
    if rest_tokens:
        alias_map = MYEON_SIGUNGU_ALIAS.get(normalized_sido, {})
        target_name = alias_map.get(rest_tokens[0])
        if target_name:
            for name, code in candidates:
                if name == target_name:
                    return code

    return None


def fetch_page(page_no: int):
    params = {
        "serviceKey": SERVICE_KEY,
        "pageNo": page_no,
        "numOfRows": NUM_OF_ROWS,
        "type": "json",
    }
    res = requests.get(SERVICE_URL, params=params, timeout=30)
    res.raise_for_status()
    body = res.json()

    header = body.get("response", {}).get("header", {})
    result_code = header.get("resultCode")
    if result_code not in ("00", None):
        msg = ERROR_MESSAGES.get(result_code, "UNKNOWN")
        raise RuntimeError(f"API error {result_code}: {msg} / {header.get('resultMsg')}")

    resp_body = body.get("response", {}).get("body", {})
    items = resp_body.get("items", [])
    if isinstance(items, dict):
        items = items.get("item", [])
    total_count = to_int(resp_body.get("totalCount", 0)) or 0
    return items, total_count


def yn_to_bool(val):
    if val is None or val == "":
        return None
    return str(val).strip().upper() == "Y"


def to_float(val):
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def to_int(val):
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def upsert_facility(cur, item, region_lookup):
    name = item.get("bcyclLendNm")
    org = item.get("institutionNm") or ""
    addr = item.get("rdnmadr") or item.get("lnmadr") or ""

    if not name:
        return

    # 표준데이터엔 고유 ID가 없어 기관명+대여소명+주소 조합을 해시.
    # varchar(50) 제약 대응: "std:" + md5(32자) = 36자
    raw_key = f"{org}:{name}:{addr}".strip()
    source_id = "std:" + hashlib.md5(raw_key.encode("utf-8")).hexdigest()

    lat = to_float(item.get("latitude"))
    lng = to_float(item.get("longitude"))
    if lat is None or lng is None:
        return

    facility_type = FACILITY_TYPE_MAP.get(item.get("bcyclLendSe", ""), "rental_unknown")
    repair_available = yn_to_bool(item.get("repairStandYn"))
    total_bikes = to_int(item.get("bcyclHoldCharge"))
    holder_co = to_int(item.get("holderCo"))

    open_start = item.get("operOpenHm") or ""
    open_end = item.get("operCloseHm") or ""
    open_hours = f"{open_start}~{open_end}" if open_start and open_end else None

    fee_type = item.get("chrgeSe") or None
    region_code = resolve_region_code(addr, region_lookup)
    now = datetime.now(timezone.utc)

    cur.execute(
        """
        INSERT INTO bicycle_facility (
            source_id, facility_title, addr1, map_x, map_y, geom,
            facility_type, rental_fee_type, repair_available,
            open_hours, total_bikes, region_code, created_at, synced_at
        ) VALUES (
            %(source_id)s, %(title)s, %(addr)s, %(lng)s, %(lat)s,
            ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326),
            %(facility_type)s, %(fee_type)s, %(repair)s,
            %(open_hours)s, %(total_bikes)s, %(region_code)s, %(now)s, %(now)s
        )
        ON CONFLICT (source_id) DO UPDATE SET
            facility_title = EXCLUDED.facility_title,
            addr1 = EXCLUDED.addr1,
            map_x = EXCLUDED.map_x,
            map_y = EXCLUDED.map_y,
            geom = EXCLUDED.geom,
            facility_type = EXCLUDED.facility_type,
            rental_fee_type = EXCLUDED.rental_fee_type,
            repair_available = EXCLUDED.repair_available,
            open_hours = EXCLUDED.open_hours,
            total_bikes = EXCLUDED.total_bikes,
            region_code = EXCLUDED.region_code,
            synced_at = EXCLUDED.synced_at
        """,
        {
            "source_id": source_id,
            "title": name,
            "addr": addr,
            "lng": lng,
            "lat": lat,
            "facility_type": facility_type,
            "fee_type": fee_type,
            "repair": repair_available,
            "open_hours": open_hours,
            "total_bikes": total_bikes if total_bikes is not None else holder_co,
            "region_code": region_code,
            "now": now,
        },
    )
    return region_code is None  # True면 매칭 실패


def main():
    conn = get_conn()
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    region_lookup = load_region_lookup(cur)
    print(f"region 테이블 {sum(len(v) for v in region_lookup.values())}건 로드")

    page_no = 1
    total_upserted = 0
    unmatched_region = 0
    total_count = None

    while True:
        items, total_count = fetch_page(page_no)
        if not items:
            break

        for item in items:
            failed = upsert_facility(cur, item, region_lookup)
            if failed:
                unmatched_region += 1
            total_upserted += 1

        conn.commit()
        print(f"[page {page_no}] {len(items)}건 처리, 누적 {total_upserted}/{total_count}")

        if len(items) < NUM_OF_ROWS or (total_count and total_upserted >= total_count):
            break

        page_no += 1
        time.sleep(REQUEST_INTERVAL_SEC)

    cur.close()
    conn.close()
    print(f"완료: 총 {total_upserted}건 적재 (region_code 매칭 실패 {unmatched_region}건)")


if __name__ == "__main__":
    main()