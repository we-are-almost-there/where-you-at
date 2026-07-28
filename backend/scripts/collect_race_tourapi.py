"""
TourAPI searchKeyword2 + detailIntro2 -> race 테이블 적재 (러닝/자전거 행사)

키워드로 1차 검색(contentTypeId=15, 행사/공연/축제) -> contentid 중복 제거
-> detailIntro2로 날짜/장소 보강 -> race 테이블 upsert.

region_code는 tour_spot 수집 방식과 동일하게 lDongRegnCd(2자리)+lDongSignguCd(3자리)
직접 조합으로 채운다 (주소 텍스트 파싱 불필요).

키워드 검증 결과:
- "레이스" 단독 키워드는 오탐(클리퍼 레이스=국제 요트대회 등)이 섞이고
  실제 러닝 대회는 "나이트레이스" 등 복합 키워드로 이미 커버되어 제외.
- 복합종목(3종/듀애슬론/트라이애슬론)은 event_type을 marathon/cycling 중
  하나로 억지로 분류하기 애매해서 수집 대상에서 제외.

실행:
    python collect_race_tourapi.py
"""

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

BASE_URL = "https://apis.data.go.kr/B551011/KorService2"
SERVICE_KEY = os.environ["TOUR_API_KEY"]
REQUEST_INTERVAL_SEC = 0.3

KEYWORD_EVENT_TYPE = {
    # ── 러닝 계열 (마라톤/걷기 등 발로 하는 대회 전부 포괄) ──
    "마라톤": "running",
    "달리기": "running",
    "러닝": "running",
    "걷기": "running",
    "워킹": "running",
    "나이트워크": "running",   # "한강나이트워크42K"처럼 거리(42K)로만 마라톤임을
                               # 암시하고 "마라톤"이란 단어가 없는 대회명 대응
    "나이트런": "running",     # 나이트워크(걷기)와 별개 표현. "러닝"/"마라톤"
                               # 키워드에 안 걸리는 독립 문자열이라 추가
    "나이트레이스": "running", # 위와 동일한 이유. 단, "레이스" 단독으로는 안 씀
                               # (클리퍼 레이스=요트대회처럼 오탐 섞여서 제외)

    # ── 자전거 계열 ──
    "자전거": "cycling",
    "라이딩": "cycling",
    "사이클": "cycling",
    "그란폰도": "cycling",  # gran fondo. 이탈리아어로 "큰 거리"라는 뜻의
                           # 장거리 동호인 자전거 대회 형식(수십~수백km,
                           # 완주 중심, 등수 경쟁 없음). 국내에도 "OO 그란폰도"
                           # 이름으로 여는 대회가 있어서 "자전거"/"사이클"
                           # 키워드에 안 걸릴 걸 대비해 추가
    "MTB": "cycling",      # Mountain Bike. 산길/임도를 달리는 오프로드
                           # 자전거 종목. 대회명에 "MTB"만 쓰고 "자전거"라는
                           # 한글 단어가 안 들어가는 경우가 많아 별도로 추가
}


def get_conn():
    conn = psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASSWORD,
    )
    conn.set_client_encoding("UTF8")
    return conn


def to_float(val):
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def search_keyword(keyword: str, page_no: int = 1):
    params = {
        "serviceKey": SERVICE_KEY,
        "MobileOS": "ETC",
        "MobileApp": "WhereYouAt",
        "_type": "json",
        "contentTypeId": 15,
        "keyword": keyword,
        "numOfRows": 50,
        "pageNo": page_no,
    }
    res = requests.get(f"{BASE_URL}/searchKeyword2", params=params, timeout=30)
    res.raise_for_status()
    body = res.json().get("response", {}).get("body", {})
    items = body.get("items", "")
    if isinstance(items, dict):
        items = items.get("item", [])
    if isinstance(items, dict):  # 단건이면 dict로 옴
        items = [items]
    total_count = int(body.get("totalCount", 0) or 0)
    return items or [], total_count


def fetch_detail_intro(content_id: str):
    params = {
        "serviceKey": SERVICE_KEY,
        "MobileOS": "ETC",
        "MobileApp": "WhereYouAt",
        "_type": "json",
        "contentId": content_id,
        "contentTypeId": 15,
    }
    res = requests.get(f"{BASE_URL}/detailIntro2", params=params, timeout=30)
    res.raise_for_status()
    body = res.json().get("response", {}).get("body", {})
    items = body.get("items", "")
    if isinstance(items, dict):
        items = items.get("item")
    if isinstance(items, list):
        items = items[0] if items else None
    return items


def parse_yyyymmdd(val):
    if not val or len(val) != 8:
        return None
    try:
        return datetime.strptime(val, "%Y%m%d").date()
    except ValueError:
        return None


def build_region_code(item):
    """tour_spot 수집 방식과 동일: 법정동 시도코드(2자리)+시군구코드(3자리) 직접 조합.
    주소 텍스트 파싱(resolve_region_code) 불필요."""
    regn = (item.get("lDongRegnCd") or "").strip()
    signgu = (item.get("lDongSignguCd") or "").strip()
    if not regn or not signgu:
        return None
    return regn + signgu


def collect():
    conn = get_conn()
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    seen = {}  # contentid -> (item, event_type)
    for keyword, event_type in KEYWORD_EVENT_TYPE.items():
        page_no = 1
        while True:
            items, total_count = search_keyword(keyword, page_no)
            if not items:
                break
            for it in items:
                if it.get("contenttypeid") != "15":
                    continue
                cid = it.get("contentid")
                if cid and cid not in seen:
                    seen[cid] = (it, event_type)
            if page_no * 50 >= total_count:
                break
            page_no += 1
            time.sleep(REQUEST_INTERVAL_SEC)
        print(f"[{keyword}] 누적 후보 {len(seen)}건")

    print(f"총 후보 {len(seen)}건, detailIntro2 조회 시작")

    upserted = 0
    skipped_no_date = 0
    skipped_past = 0
    for content_id, (item, event_type) in seen.items():
        detail = fetch_detail_intro(content_id)
        time.sleep(REQUEST_INTERVAL_SEC)
        if not detail:
            continue

        start_date = parse_yyyymmdd(detail.get("eventstartdate"))
        if not start_date:
            skipped_no_date += 1
            continue  # race.start_date NOT NULL이라 없으면 스킵

        end_date = parse_yyyymmdd(detail.get("eventenddate"))
        # 이미 종료된 대회는 저장하지 않는다. end_date가 없으면(하루짜리
        # 대회 등) start_date로 판단한다.
        reference_date = end_date or start_date
        if reference_date < datetime.now(timezone.utc).date():
            skipped_past += 1
            continue
        region_code = build_region_code(item)
        map_x = to_float(item.get("mapx"))
        map_y = to_float(item.get("mapy"))
        now = datetime.now(timezone.utc)

        cur.execute(
            """
            INSERT INTO race (
                source, source_id, race_title, event_type,
                start_date, end_date, location_name,
                map_x, map_y, region_code, contact, homepage_url,
                created_at, synced_at
            ) VALUES (
                'tourapi', %(source_id)s, %(title)s, %(event_type)s,
                %(start_date)s, %(end_date)s, %(location_name)s,
                %(map_x)s, %(map_y)s, %(region_code)s, %(contact)s, %(homepage)s,
                %(now)s, %(now)s
            )
            ON CONFLICT (source, source_id) DO UPDATE SET
                race_title = EXCLUDED.race_title,
                event_type = EXCLUDED.event_type,
                start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date,
                location_name = EXCLUDED.location_name,
                map_x = EXCLUDED.map_x,
                map_y = EXCLUDED.map_y,
                region_code = EXCLUDED.region_code,
                contact = EXCLUDED.contact,
                homepage_url = EXCLUDED.homepage_url,
                synced_at = EXCLUDED.synced_at
            """,
            {
                "source_id": content_id,
                "title": item.get("title"),
                "event_type": event_type,
                "start_date": start_date,
                "end_date": end_date,
                "location_name": detail.get("eventplace") or item.get("addr1"),
                "map_x": map_x,
                "map_y": map_y,
                "region_code": region_code,
                "contact": detail.get("sponsor1"),
                "homepage": detail.get("eventhomepage") or None,
                "now": now,
            },
        )
        upserted += 1
        if upserted % 20 == 0:
            conn.commit()
            print(f"진행 {upserted}/{len(seen)}")

    conn.commit()
    cur.close()
    conn.close()
    print(
        f"완료: {upserted}건 적재 "
        f"(날짜 없어 스킵 {skipped_no_date}건, 이미 종료돼 스킵 {skipped_past}건)"
    )


if __name__ == "__main__":
    collect()