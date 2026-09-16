"""
행정안전부 한국지역정보개발원_(전국 통합데이터) 전국 공영자전거 실시간 정보
-> bicycle_facility.available_bikes / realtime_synced_at 갱신

데이터셋: 15126639
엔드포인트: https://apis.data.go.kr/B551982/pbdo_v2/inf_101_00010002_v2 (대여소별 대여가능 자전거 현황정보)

11개 지자체 코드(lcgvmnInstCd)로 순회 호출.
표준데이터엔 고유 ID가 없어서, 실시간 API 좌표(lat/lot)로
bicycle_facility의 geom과 가장 가까운 행을 찾아(KNN, <-> 연산자)
일정 거리 이내(DISTANCE_THRESHOLD_M)일 때만 업데이트한다.
매칭 실패(반경 밖 = 표준데이터에 없는 대여소)는 좌표+이름만으로 새 row 삽입한다
(주소 정보는 이 API가 안 줘서 NULL, region_code도 NULL로 남는다).

무인 실행(GitHub Actions, Task Scheduler 등) 대비:
- 지자체 하나 실패해도 나머지는 계속 진행 (예외를 지자체 단위로 격리)
- 일시적 네트워크 오류는 재시도(최대 3회, 지수 백오프)
- 기본적으로 로그를 파일에도 남김 (logs/collect_bicycle_realtime.log)
- BICYCLE_FILE_LOG_ENABLED=false이면 파일 로그 없이 표준 오류에만 기록

backend 디렉터리에서 실행:
    python -m scripts.collect_bicycle_realtime
"""

import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, quote_plus

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

SERVICE_URL = "https://apis.data.go.kr/B551982/pbdo_v2/inf_101_00010002_v2"
# 공공데이터포털 일반 인증키(디코딩). 계정당 하나라 TourAPI 수집과 같은 키를 쓴다.
# params로 넘기면 requests가 인코딩하므로 디코딩된 값이어야 한다.
SERVICE_KEY = os.environ["TOUR_API_KEY"]

NUM_OF_ROWS = 1000
REQUEST_INTERVAL_SEC = 0.3
DISTANCE_THRESHOLD_M = 50  # 이 거리(미터) 이내에서 가장 가까운 대여소만 매칭
MAX_RETRIES = 3
RETRY_BACKOFF_SEC = 2  # 재시도마다 이 값 * 시도횟수만큼 대기

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"


def redact_sensitive_text(value: object) -> str:
    """공개 로그에 공공데이터포털 인증키가 남지 않게 한다."""
    text = str(value)
    text = re.sub(
        r"(?i)(serviceKey=)[^&\s\"']+",
        r"\1[REDACTED]",
        text,
    )
    encoded_keys = {
        SERVICE_KEY,
        quote(SERVICE_KEY, safe=""),
        quote_plus(SERVICE_KEY, safe=""),
    }
    for key in sorted(encoded_keys, key=len, reverse=True):
        if key:
            text = text.replace(key, "[REDACTED]")
    return text


def build_log_handlers() -> list[logging.Handler]:
    handlers: list[logging.Handler] = [logging.StreamHandler()]
    file_log_enabled = os.environ.get("BICYCLE_FILE_LOG_ENABLED", "true").strip().lower()
    if file_log_enabled not in {"0", "false", "no", "off"}:
        LOG_DIR.mkdir(exist_ok=True)
        handlers.insert(
            0,
            logging.FileHandler(LOG_DIR / "collect_bicycle_realtime.log", encoding="utf-8"),
        )
    return handlers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=build_log_handlers(),
)
logger = logging.getLogger(__name__)

# 11개 지자체 코드 (요청변수 설명 기준)
LCGVMN_INST_CODES = {
    "서울": "1100000000",
    "부산 기장군": "2671000000",
    "광주": "2900000000",
    "대전": "3000000000",
    "세종": "3611000000",
    "충남 공주시": "4415000000",
    "전남 여수시": "4613000000",
    "전남 순천시": "4615000000",
    "경북 경주시": "4713000000",
    "경남 창원시": "4812000000",
    "경남 거창군": "4888000000",
}

ERROR_MESSAGES = {
    "K0": "NORMAL_SERVICE",
    "K01": "APPLICATION_ERROR",
    "K02": "DB_ERROR",
    "K03": "NODATA_ERROR",
    "K04": "HTTP_ERROR",
    "K05": "SERVICETIMEOUT_ERROR",
    "K10": "INVALID_REQUEST_PARAMETER_ERROR",
    "K11": "NO_MANDATORY_REQUEST_PARAMETERS_ERROR",
    "K12": "NO_OPENAPI_SERVICE_ERROR",
    "K20": "SERVICE_ACCESS_DENIED_ERROR",
    "K21": "TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR",
    "K22": "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR",
    "K30": "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
    "K31": "DEADLINE_HAS_EXPIRED_ERROR",
    "K32": "UNREGISTERED_IP_ERROR",
    "K33": "UNSIGNED_CALL_ERROR",
    "K90": "RUNTIME_ERROR",
    "K99": "UNKNOWN_ERROR",
}


def get_conn():
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )
    conn.set_client_encoding("UTF8")
    return conn


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


def fetch_page(inst_cd: str, page_no: int):
    """재시도 포함 페이지 조회. MAX_RETRIES 소진하면 예외를 그대로 던진다
    (호출부인 process_institution에서 지자체 단위로 잡아서 다음으로 넘어간다)."""
    params = {
        "serviceKey": SERVICE_KEY,
        "pageNo": page_no,
        "numOfRows": NUM_OF_ROWS,
        "type": "json",
        "lcgvmnInstCd": inst_cd,
    }

    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            res = requests.get(SERVICE_URL, params=params, timeout=30)
            res.raise_for_status()
            body = res.json()

            # 이 API는 표준데이터 API와 달리 "response" 최상위 래퍼가 없다:
            # {"header": {...}, "body": {...}} 형태이며 성공 코드는 "K0"
            header = body.get("header", {})
            result_code = header.get("resultCode")
            if result_code not in ("K0", None):
                msg = ERROR_MESSAGES.get(result_code, "UNKNOWN")
                raise RuntimeError(f"API error {result_code}: {msg} / {header.get('resultMsg')}")

            resp_body = body.get("body", {})
            items = resp_body.get("item", [])
            if isinstance(items, dict):
                items = [items]
            total_count = to_int(resp_body.get("totalCount", 0)) or 0
            return items, total_count

        except (requests.exceptions.RequestException, RuntimeError, ValueError) as exc:
            last_exc = exc
            safe_exc = redact_sensitive_text(exc)
            if attempt < MAX_RETRIES:
                wait = RETRY_BACKOFF_SEC * attempt
                logger.warning(
                    f"[{inst_cd}] page {page_no} 요청 실패 (시도 {attempt}/{MAX_RETRIES}): {safe_exc} "
                    f"-> {wait}초 후 재시도"
                )
                time.sleep(wait)
            else:
                logger.error(
                    f"[{inst_cd}] page {page_no} 최종 실패 ({MAX_RETRIES}회 시도): {safe_exc}"
                )

    raise last_exc  # 재시도 다 소진 -> 상위(지자체 단위)에서 처리


def update_nearest_facility(cur, inst_cd: str, item) -> str:
    """가장 가까운 facility를 찾아 available_bikes 갱신.
    반경 이내 매칭이 없으면 새 row로 삽입(주소 정보 없음, region_code는 NULL).
    반환값: "matched" | "inserted" | "skipped"(좌표 없음)"""
    lat = to_float(item.get("lat"))
    lng = to_float(item.get("lot"))
    available = to_int(item.get("bcyclTpkctNocs"))
    rntstn_id = item.get("rntstnId")
    rntstn_nm = item.get("rntstnNm")
    if lat is None or lng is None:
        return "skipped"

    now = datetime.now(timezone.utc)

    cur.execute(
        """
        UPDATE bicycle_facility AS bf
        SET available_bikes = %(available)s,
            realtime_synced_at = %(now)s
        FROM (
            SELECT bicycle_id
            FROM bicycle_facility
            WHERE ST_DWithin(
                geom::geography,
                ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
                %(threshold)s
            )
            ORDER BY geom <-> ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)
            LIMIT 1
        ) AS nearest
        WHERE bf.bicycle_id = nearest.bicycle_id
        """,
        {
            "available": available,
            "now": now,
            "lng": lng,
            "lat": lat,
            "threshold": DISTANCE_THRESHOLD_M,
        },
    )
    if cur.rowcount > 0:
        return "matched"

    # 반경 이내 매칭 실패 -> 표준데이터에 없는 대여소, 새 row 삽입
    source_id = f"rt:{inst_cd}:{rntstn_id}"
    cur.execute(
        """
        INSERT INTO bicycle_facility (
            source_id, facility_title, addr1, map_x, map_y, geom,
            facility_type, available_bikes, created_at, synced_at, realtime_synced_at
        ) VALUES (
            %(source_id)s, %(title)s, NULL, %(lng)s, %(lat)s,
            ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326),
            'rental_unknown', %(available)s, %(now)s, %(now)s, %(now)s
        )
        ON CONFLICT (source_id) DO UPDATE SET
            facility_title = EXCLUDED.facility_title,
            map_x = EXCLUDED.map_x,
            map_y = EXCLUDED.map_y,
            geom = EXCLUDED.geom,
            available_bikes = EXCLUDED.available_bikes,
            realtime_synced_at = EXCLUDED.realtime_synced_at
        """,
        {
            "source_id": source_id,
            "title": rntstn_nm,
            "lng": lng,
            "lat": lat,
            "available": available,
            "now": now,
        },
    )
    return "inserted"


def process_institution(conn, label: str, inst_cd: str) -> dict:
    """한 지자체 전체 페이지 처리. 실패해도 예외를 여기서 잡아 상위로 전파하지 않는다
    (다른 지자체 처리를 막지 않기 위함). 실패 시 stats에 error를 담아 반환."""
    stats = {"seen": 0, "matched": 0, "inserted": 0, "skipped": 0, "error": None}
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        page_no = 1
        inst_total = 0
        while True:
            items, total_count = fetch_page(inst_cd, page_no)
            if not items:
                break

            for item in items:
                stats["seen"] += 1
                inst_total += 1
                result = update_nearest_facility(cur, inst_cd, item)
                stats[result] = stats.get(result, 0) + 1

            conn.commit()

            if len(items) < NUM_OF_ROWS or (total_count and inst_total >= total_count):
                break

            page_no += 1
            time.sleep(REQUEST_INTERVAL_SEC)

        logger.info(f"[{label}] {inst_total}건 처리")

    except Exception as exc:
        conn.rollback()
        safe_exc = redact_sensitive_text(exc)
        stats["error"] = safe_exc
        logger.error(f"[{label}] 지자체 처리 중단, 다음으로 넘어감: {safe_exc}")

    finally:
        cur.close()

    return stats


def main():
    conn = get_conn()
    conn.autocommit = False

    total_seen = 0
    total_matched = 0
    total_inserted = 0
    total_skipped = 0
    failed_institutions = []

    try:
        for label, inst_cd in LCGVMN_INST_CODES.items():
            stats = process_institution(conn, label, inst_cd)
            total_seen += stats["seen"]
            total_matched += stats["matched"]
            total_inserted += stats["inserted"]
            total_skipped += stats["skipped"]
            if stats["error"]:
                failed_institutions.append(label)

    finally:
        conn.close()

    logger.info(
        f"완료: 총 {total_seen}건 (기존 매칭 갱신 {total_matched}건 / "
        f"신규 삽입 {total_inserted}건 / 좌표없음 스킵 {total_skipped}건)"
    )
    if failed_institutions:
        logger.warning(f"실패한 지자체: {', '.join(failed_institutions)} -> 다음 실행 때 재시도됨")


if __name__ == "__main__":
    main()
