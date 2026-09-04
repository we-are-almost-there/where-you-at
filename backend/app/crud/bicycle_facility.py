from psycopg2.extras import RealDictCursor
from .region import code2_to_sido


def get_bicycle_facility_by_id(conn, bicycle_id: int) -> dict | None:
    """자전거 시설 단건 조회"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
                bicycle_id AS id, facility_title, addr1, map_x, map_y,
                facility_type, rental_fee_type, repair_available,
                open_hours, total_bikes, available_bikes,
                region_code, realtime_synced_at
            FROM bicycle_facility
            WHERE bicycle_id = %s
            """,
            (bicycle_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def list_bicycle_facilities(
    conn,
    *,
    region: str | None = None,
    facility_type: str | None = None,
    fee_type: str | None = None,
    data_source: str | None = None,
    page: int = 1,
    size: int = 20,
) -> tuple[int, list[dict]]:
    """필터 + 페이지네이션을 적용해 (total_count, 목록)을 반환한다.

    data_source: source_id 접두어(std:/rt:)로 원 수집 출처를 구분해 탭으로 노출한다.
    카드 레이아웃이 이 두 출처로만 갈리므로(표준데이터=5필드 카드, 실시간=간단 카드)
    탭도 이 둘로만 나눈다. 표준데이터(1,493건) 안에서 실시간 매칭 여부는
    탭을 나누지 않고 카드 내부에서 자연스럽게 표시한다:
    - 실시간 매칭됨(657건) → "대여 가능 N대"
    - 실시간 매칭 안 됨(836건) → total_bikes 유무에 따라 "보유 N대" 또는 "보유 수량 확인 불가"
    - "standard": 표준데이터(std:) 전체 (1,493건, 실시간 매칭 여부 무관)
    - "realtime": 실시간 API 신규삽입(rt:) 전체 (4,780건)
    fee_type: rental_fee_type 필터(무료/유료). "실시간" 탭 카드는 요금
    정보를 표시하지 않으므로 프론트에서는 "운영 정보" 탭에서만 이 필터를 노출한다.
    None이면 필터 없이 전체.
    """
    where = []
    params: list = []

    if region:
        where.append("region_code LIKE %s")
        params.append(region + "%")
    if facility_type:
        where.append("facility_type = %s")
        params.append(facility_type)
    if fee_type == "유료":
        where.append("rental_fee_type IN (%s, %s)")
        params.append("유료")
        params.append("혼합")
    elif fee_type:
        where.append("rental_fee_type = %s")
        params.append(fee_type)
    if data_source == "standard":
        where.append("source_id LIKE %s")
        params.append("std:%")
    elif data_source == "realtime":
        where.append("source_id LIKE %s")
        params.append("rt:%")

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            f"SELECT count(*) AS total FROM bicycle_facility {where_sql}",
            params,
        )
        total = cur.fetchone()["total"]

        cur.execute(
            f"""
            SELECT
                bicycle_id AS id, facility_title, addr1, map_x, map_y,
                facility_type, rental_fee_type, repair_available, open_hours,
                total_bikes, available_bikes, region_code, realtime_synced_at
            FROM bicycle_facility
            {where_sql}
            ORDER BY bicycle_id
            LIMIT %s OFFSET %s
            """,
            [*params, size, (page - 1) * size],
        )
        rows = cur.fetchall()

    return total, rows


def list_bicycle_regions(conn, data_source: str | None = None) -> list[dict]:
    """자전거 시설이 있는 지역 전체(시/도 + 시/군/구)를 한 번에 반환한다.
    data_source로 현재 탭(std:/rt:) 기준으로만 걸러, 그 탭에 실제로 존재하지
    않는 지역이 드롭다운에 나타나는 것을 막는다.
    course의 Region[]과 동일한 {region_code, name, sido} 구조를 반환하지만,
    프론트에서는 자전거 도메인 전용 buildBicycleRegionOptions()로 가공해서
    BicycleRegionSelect에 넣는다.
    """
    where = ["bf.region_code IS NOT NULL"]
    params: list = []
    if data_source == "standard":
        where.append("bf.source_id LIKE %s")
        params.append("std:%")
    elif data_source == "realtime":
        where.append("bf.source_id LIKE %s")
        params.append("rt:%")

    where_sql = " AND ".join(where)

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            f"""
            SELECT DISTINCT r.region_code, r.name, r.sido
            FROM bicycle_facility bf
            JOIN region r ON r.region_code = bf.region_code
            WHERE {where_sql}
            ORDER BY r.region_code
            """,
            params,
        )
        return cur.fetchall()


def list_bicycle_subregions(conn, parent_code: str, data_source: str | None = None) -> list[dict]:
    """상위 지역 코드(시/도 2자리 또는 시/군 4자리) 안의 하위 구 목록을 반환한다.
    각 구의 시설 개수(cnt)는 현재 보고 있는 탭(data_source) 기준으로 계산한다.

    세종처럼 region 테이블에 시/도 자체를 가리키는 row(36110)만 있고 진짜 하위
    지역이 없는 경우, region_code 자릿수 비교(len > len(parent_code))만으로는
    이 row 자신을 "하위 구"로 잘못 포함시킨다(5자리 > 2자리이므로). 이를 막기
    위해 region_code가 parent_code로 시작하되, 이름이 그 시/도 자체와 같은 row
    (=시/도 자체를 가리키는 대표 row)는 제외한다.
    """
    where = ["bf.region_code LIKE %s"]
    params: list = [parent_code + "%"]
    if data_source == "standard":
        where.append("bf.source_id LIKE %s")
        params.append("std:%")
    elif data_source == "realtime":
        where.append("bf.source_id LIKE %s")
        params.append("rt:%")

    where_sql = " AND ".join(where)

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            f"""
            SELECT r.region_code, r.name, r.sido, count(*) AS cnt
            FROM bicycle_facility bf
            JOIN region r ON r.region_code = bf.region_code
            WHERE {where_sql}
            GROUP BY r.region_code, r.name, r.sido
            ORDER BY r.region_code
            """,
            params,
        )
        rows = cur.fetchall()

    return [r for r in rows if len(r["region_code"]) > len(parent_code) and r["name"] != r["sido"]]
