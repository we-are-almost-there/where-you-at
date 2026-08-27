import os
import sys
import time

# 프로젝트 루트를 path에 추가 (backend/ 에서 실행 기준)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from psycopg2.extras import execute_values
from app.db.supabase import get_db_connection
from app.services.tour_api import (
    CONTENT_TYPES,
    DETAIL_TABLE_MAP,
    fetch_area_based_list,
    fetch_detail_intro,
)


# ── UPSERT ───────────────────────────────────────────────────────────────────

def upsert_tour_spots(conn, rows: list[dict]):
    if not rows:
        return
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO tour_spot (
                content_id, content_type_id, tour_spot_title,
                addr1, addr2, map_x, map_y,
                first_image, region_code, created_at, synced_at
            ) VALUES %s
            ON CONFLICT (content_id) DO UPDATE SET
                content_type_id = EXCLUDED.content_type_id,
                tour_spot_title = EXCLUDED.tour_spot_title,
                addr1           = EXCLUDED.addr1,
                addr2           = EXCLUDED.addr2,
                map_x           = EXCLUDED.map_x,
                map_y           = EXCLUDED.map_y,
                first_image     = EXCLUDED.first_image,
                region_code     = EXCLUDED.region_code,
                synced_at       = EXCLUDED.synced_at
            """,
            [
                (
                    r["content_id"], r["content_type_id"], r["tour_spot_title"],
                    r.get("addr1"), r.get("addr2"), r["map_x"], r["map_y"],
                    r.get("first_image"), r.get("region_code"),
                )
                for r in rows
            ],
            template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())",
        )
    conn.commit()


def upsert_attraction(conn, rows: list[dict]):
    if not rows:
        return
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO attraction (content_id, info_center, rest_date, use_time, parking, use_fee, sale_item)
            VALUES %s
            ON CONFLICT (content_id) DO UPDATE SET
                info_center = EXCLUDED.info_center,
                rest_date   = EXCLUDED.rest_date,
                use_time    = EXCLUDED.use_time,
                parking     = EXCLUDED.parking,
                use_fee     = EXCLUDED.use_fee,
                sale_item   = EXCLUDED.sale_item
            """,
            [
                (
                    r["content_id"],
                    # info_center: 12, 14, 38 각각 다른 필드명
                    r.get("infocenter") or r.get("infocenterculture") or r.get("infocentershopping"),
                    # rest_date
                    r.get("restdate") or r.get("restdateculture") or r.get("restdateshopping"),
                    # use_time
                    r.get("usetime") or r.get("usetimeculture") or r.get("opentime"),
                    # parking
                    r.get("parking") or r.get("parkingculture") or r.get("parkingshopping"),
                    # use_fee: 14만 있음
                    r.get("usefee"),
                    # sale_item: 38만 있음
                    r.get("saleitem"),
                )
                for r in rows
            ],
        )
    conn.commit()


def upsert_accommodation(conn, rows: list[dict]):
    if not rows:
        return
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO accommodation (content_id, checkin_time, checkout_time, parking, reservation_url)
            VALUES %s
            ON CONFLICT (content_id) DO UPDATE SET
                checkin_time    = EXCLUDED.checkin_time,
                checkout_time   = EXCLUDED.checkout_time,
                parking         = EXCLUDED.parking,
                reservation_url = EXCLUDED.reservation_url
            """,
            [
                (
                    r["content_id"],
                    r.get("checkintime"),
                    r.get("checkouttime"),
                    r.get("parkinglodging"),
                    r.get("reservationurl"),
                )
                for r in rows
            ],
        )
    conn.commit()


def upsert_restaurant(conn, rows: list[dict]):
    if not rows:
        return
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO restaurant (content_id, first_menu, treat_menu, open_time, rest_date)
            VALUES %s
            ON CONFLICT (content_id) DO UPDATE SET
                first_menu = EXCLUDED.first_menu,
                treat_menu = EXCLUDED.treat_menu,
                open_time  = EXCLUDED.open_time,
                rest_date  = EXCLUDED.rest_date
            """,
            [
                (
                    r["content_id"],
                    r.get("firstmenu"),
                    r.get("treatmenu"),
                    r.get("opentimefood"),
                    r.get("restdatefood"),
                )
                for r in rows
            ],
        )
    conn.commit()


UPSERT_DETAIL_FN = {
    "attraction": upsert_attraction,
    "accommodation": upsert_accommodation,
    "restaurant": upsert_restaurant,
}

DETAIL_TABLE_QUERY = {
    "12": "attraction",
    "14": "attraction",
    "32": "accommodation",
    "38": "attraction",
    "39": "restaurant",
}


# ── 수집 ─────────────────────────────────────────────────────────────────────

def collect_by_content_type(conn, content_type_id: int):
    ctype_str = str(content_type_id)
    detail_table = DETAIL_TABLE_MAP[ctype_str]
    print(f"\n[INFO] 콘텐츠타입 {content_type_id} 수집 시작 → {detail_table}")

    page_no = 1
    num_of_rows = 100
    total_collected = 0
    max_pages = None  # 첫 페이지 응답 후 설정

    while True:
        try:
            items, total_count = fetch_area_based_list(content_type_id, page_no, num_of_rows)
        except Exception as e:
            print(f"[ERROR] areaBasedList 실패 (page {page_no}): {e}")
            break

        if not items:
            break

        if max_pages is None:
            max_pages = -(-total_count // num_of_rows) + 1

        spot_rows = []
        detail_rows = []

        for item in items:
            content_id = item.get("contentid")
            try:
                map_x = float(item.get("mapx") or 0)
                map_y = float(item.get("mapy") or 0)
            except ValueError:
                continue
            if not map_x or not map_y:
                continue

            spot_rows.append({
                "content_id": content_id,
                "content_type_id": ctype_str,
                "tour_spot_title": item.get("title", ""),
                "addr1": item.get("addr1"),
                "addr2": item.get("addr2"),
                "map_x": map_x,
                "map_y": map_y,
                "first_image": item.get("firstimage"),
                "region_code": (item.get("lDongRegnCd") or "") + (item.get("lDongSignguCd") or "") or None
            })

            try:
                intro = fetch_detail_intro(content_id, ctype_str)
                if intro:
                    intro["content_id"] = content_id
                    detail_rows.append(intro)
                time.sleep(0.5)
            except Exception as e:
                # 429(레이트 리밋)·기타 에러는 스킵하고 계속 진행
                # collect_by_content_type은 tour_spot 공통 데이터 수집이 주목적이므로
                # 상세 테이블 누락분은 --fill-details(fill_missing_details)로 재수집
                print(f"[WARN] detailIntro 실패 content_id={content_id}: {e}")

        upsert_tour_spots(conn, spot_rows)
        UPSERT_DETAIL_FN[detail_table](conn, detail_rows)

        total_collected += len(spot_rows)
        print(f"[INFO] page {page_no} 완료 | 누적 {total_collected} / {total_count}")

        if total_collected >= total_count or page_no > max_pages:
            break

        page_no += 1
        time.sleep(0.1)

    print(f"[INFO] 콘텐츠타입 {content_type_id} 완료 — {total_collected}건")


def fill_missing_details(conn):
    """tour_spot에는 있는데 상세 테이블에 없는 것들만 detailIntro 재수집.
    429 레이트 리밋 발생 시 최대 5회 재시도 (10초~50초 간격) 포함.
    """
    for ctype_str, detail_table in DETAIL_TABLE_QUERY.items():
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT content_id FROM tour_spot
                WHERE content_type_id = %s
                AND content_id NOT IN (SELECT content_id FROM {detail_table})
            """, (ctype_str,))
            missing = [row[0] for row in cur.fetchall()]

        if not missing:
            print(f"[INFO] 콘텐츠타입 {ctype_str} 누락 없음")
            continue

        print(f"\n[INFO] 콘텐츠타입 {ctype_str} 누락 {len(missing)}건 재수집 시작")
        detail_rows = []

        for i, content_id in enumerate(missing, 1):
            for retry in range(5):
                try:
                    intro = fetch_detail_intro(content_id, ctype_str)
                    if intro:
                        intro["content_id"] = content_id
                        detail_rows.append(intro)
                    else:
                        print(f"[WARN] detailIntro 빈 응답 content_id={content_id} (상세정보 없음)")
                        detail_rows.append({"content_id": content_id})
                    time.sleep(1.0)
                    break
                except RuntimeError as e:
                    if "API_QUOTA_EXCEEDED" in str(e):
                        print("[ERROR] API 할당량 초과 — 종료합니다.")
                        if detail_rows:
                            UPSERT_DETAIL_FN[detail_table](conn, detail_rows)
                        return False
                    elif "RATE_LIMITED" in str(e):
                        wait = 10.0 * (retry + 1)
                        print(f"[WARN] 429 — {wait:.0f}초 대기 후 재시도 ({retry+1}/5)")
                        time.sleep(wait)
                    elif "TIMEOUT" in str(e):
                        wait = 3.0 * (retry + 1)
                        print(f"[WARN] 타임아웃 — {wait:.0f}초 대기 후 재시도 content_id={content_id} ({retry+1}/5)")
                        time.sleep(wait)
                        if retry == 4:
                            print(f"[ERROR] 타임아웃 5회 소진 content_id={content_id} — 이번 세션 보류, 다음 재수집 때 다시 시도")
                            # break만 하고 detail_rows에 넣지 않음 → 다음 실행 시 여전히 "누락"으로 잡혀 자동 재시도됨
                    else:
                        print(f"[ERROR] detailIntro 실패 content_id={content_id}: {e}")
                        break

            # 100건마다 중간 적재
            if len(detail_rows) >= 100:
                UPSERT_DETAIL_FN[detail_table](conn, detail_rows)
                print(f"[INFO] {i}/{len(missing)} 중간 적재 완료")
                detail_rows = []

        if detail_rows:
            UPSERT_DETAIL_FN[detail_table](conn, detail_rows)

        print(f"[INFO] 콘텐츠타입 {ctype_str} 재수집 완료")

    return True


def main():
    conn = get_db_connection()
    if not conn:
        return
    try:
        for ct in CONTENT_TYPES:
            collect_by_content_type(conn, ct)
    finally:
        conn.close()
    print("\n[INFO] 전체 수집 완료")


def main_fill():
    """누락된 상세 정보만 재수집.

    기존 스크립트 실행 시 detailIntro 호출 시간 텀이 짧아
    상세 테이블(attraction/accommodation/restaurant)에 누락이 발생할 수 있다.
    이 옵션은 tour_spot에는 있으나 상세 테이블에 없는 데이터만 선별해 재수집한다.
    """
    conn = get_db_connection()
    if not conn:
        return
    try:
        completed = fill_missing_details(conn)
    finally:
        conn.close()

    if completed:
        print("\n[INFO] 누락 상세 재수집 완료")
    else:
        print("\n[INFO] 오늘 재수집 세션 종료 (내일 다시 실행하세요)")

if __name__ == "__main__":
    args = sys.argv[1:]
    if "--fill-details" in args:
        main_fill()
    else:
        main()
