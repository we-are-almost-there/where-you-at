"""실시간 API 유래 대여소(addr1 NULL)의 주소와 지역코드를 채운다 (backfill).

1단계: Kakao 좌표→주소 변환 API로 addr1을 채움
2단계: 채워진 addr1을 region.region_code_from_address()로 역산해 region_code를 채움
       (같은 UPDATE 트랜잭션에서 이어서 처리 — 주소 없이 지역코드만 있는 반쪽 상태를 방지)

대상: bicycle_facility 중 addr1 IS NULL (실시간 API 신규삽입, 약 4,780건)
API: https://dapi.kakao.com/v2/local/geo/coord2address.json

기본은 dry-run(쓰기 없음). 실제 반영하려면: python scripts/backfill_bicycle_addr.py --apply

결과 상세는 UTF-8로 scripts/_backfill_bicycle_addr_out.txt 에 기록(터미널 한글 깨짐 회피).
"""
import os
import sys
import time

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

sys.path.insert(0, ".")
from app.crud.region import region_code_from_address

load_dotenv()

DB_HOST = os.environ["DB_HOST"]
DB_PORT = os.environ.get("DB_PORT", "5432")
DB_NAME = os.environ["DB_NAME"]
DB_USER = os.environ["DB_USER"]
DB_PASSWORD = os.environ["DB_PASSWORD"]

KAKAO_REST_API_KEY = os.environ["KAKAO_REST_API_KEY"]
GEOCODE_URL = "https://dapi.kakao.com/v2/local/geo/coord2address.json"

REQUEST_INTERVAL_SEC = 0.1  # Kakao REST API rate limit 보호
OUT_PATH = "scripts/_backfill_bicycle_addr_out.txt"

apply = "--apply" in sys.argv


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


def reverse_geocode(lng: float, lat: float) -> str | None:
    """좌표 -> 주소 문자열(도로명 우선, 없으면 지번). 실패 시 None."""
    headers = {"Authorization": f"KakaoAK {KAKAO_REST_API_KEY}"}
    params = {"x": lng, "y": lat, "input_coord": "WGS84"}

    try:
        res = requests.get(GEOCODE_URL, headers=headers, params=params, timeout=10)
    except requests.exceptions.RequestException as exc:
        print(f"  [ERROR] 요청 실패: {exc}")
        return None

    if res.status_code != 200:
        print(f"  [ERROR] status={res.status_code} body={res.text[:200]}")
        return None

    documents = res.json().get("documents", [])
    if not documents:
        return None

    doc = documents[0]
    road_addr = doc.get("road_address")
    jibun_addr = doc.get("address")

    if road_addr:
        return road_addr["address_name"]
    if jibun_addr:
        return jibun_addr["address_name"]
    return None


def main() -> None:
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(
        "SELECT bicycle_id, facility_title, map_x, map_y "
        "FROM bicycle_facility WHERE addr1 IS NULL ORDER BY bicycle_id"
    )
    rows = cur.fetchall()
    print(f"대상 {len(rows)}건 · {'APPLY' if apply else 'DRY-RUN(미반영)'}")

    # (id, title, addr, region_code|None)
    resolved: list[tuple[int, str, str, str | None]] = []
    unresolved_addr = []  # 주소 자체를 못 찾은 것
    unresolved_region = []  # 주소는 찾았지만 region_code 역산 실패

    for i, row in enumerate(rows, start=1):
        addr = reverse_geocode(row["map_x"], row["map_y"])

        if not addr:
            unresolved_addr.append((row["bicycle_id"], row["facility_title"], row["map_y"], row["map_x"]))
        else:
            region_code = "36110" if addr.startswith("세종특별자치시") else region_code_from_address(conn, addr)
            resolved.append((row["bicycle_id"], row["facility_title"], addr, region_code))
            if region_code is None:
                unresolved_region.append((row["bicycle_id"], row["facility_title"], addr))

        if i % 100 == 0:
            print(f"[{i}/{len(rows)}] 주소성공 {len(resolved)} / 주소실패 {len(unresolved_addr)}")

        time.sleep(REQUEST_INTERVAL_SEC)

    lines = ["[주소 + 지역코드 역산 성공]"]
    for bid, title, addr, rc in resolved:
        lines.append(f"  id={bid:5d} rc={rc or '없음':>5}  addr={addr}  ({title})")
    lines.append("")
    lines.append("[주소 역지오코딩 실패 (addr1도 변경 안 함)]")
    for bid, title, lat, lng in unresolved_addr:
        lines.append(f"  id={bid:5d} lat={lat} lng={lng}  ({title})")
    lines.append("")
    lines.append("[주소는 찾았지만 지역코드 역산 실패 (addr1만 채워짐, region_code는 NULL 유지)]")
    for bid, title, addr in unresolved_region:
        lines.append(f"  id={bid:5d} addr={addr}  ({title})")
    lines.append("")
    lines.append(
        f"총 {len(rows)}개 · 주소성공 {len(resolved)} · 주소실패 {len(unresolved_addr)} · "
        f"지역코드실패 {len(unresolved_region)} · {'APPLIED' if apply else 'DRY-RUN(미반영)'}"
    )
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    if apply and resolved:
        with conn.cursor() as write_cur:
            for bid, _, addr, rc in resolved:
                if rc is not None:
                    write_cur.execute(
                        "UPDATE bicycle_facility SET addr1 = %s, region_code = %s WHERE bicycle_id = %s",
                        (addr, rc, bid),
                    )
                else:
                    # region_code 역산 실패 시 기존 region_code를 NULL로 덮어쓰지 않는다.
                    # 지금은 대상이 addr1 IS NULL(원래도 region_code NULL)이라 무해하지만,
                    # 나중에 다른 조건으로 재사용하면 이미 있던 값을 지울 수 있어 방지한다.
                    write_cur.execute(
                        "UPDATE bicycle_facility SET addr1 = %s WHERE bicycle_id = %s",
                        (addr, bid),
                    )
        conn.commit()
        
    cur.close()
    conn.close()

    print(
        f"done: 주소성공={len(resolved)} 주소실패={len(unresolved_addr)} "
        f"지역코드실패={len(unresolved_region)} {'APPLIED' if apply else 'DRY-RUN'} (상세: {OUT_PATH})"
    )


if __name__ == "__main__":
    main()
