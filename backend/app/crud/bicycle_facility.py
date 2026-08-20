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
    page: int = 1,
    size: int = 20,
) -> tuple[int, list[dict]]:
    """필터 + 페이지네이션을 적용해 (total_count, 목록)을 반환한다."""
    where = []
    params: list = []

    if region:
        where.append("region_code LIKE %s")
        params.append(region + "%")
    if facility_type:
        where.append("facility_type = %s")
        params.append(facility_type)

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


def list_bicycle_regions(conn) -> list[dict]:
    """자전거 시설이 1건 이상 있는 시/도 목록을 반환한다.
    region 테이블에 시/도 단위 대표 row가 없어, region_code 앞 2자리를
    region.py의 코드→시도명 매핑으로 직접 변환한다 (course 쪽 패턴과 동일 소스).
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT DISTINCT LEFT(region_code, 2) AS code2 "
            "FROM bicycle_facility WHERE region_code IS NOT NULL ORDER BY code2"
        )
        code2s = [row[0] for row in cur.fetchall()]

    result = []
    for code2 in code2s:
        sido = code2_to_sido(code2)
        if sido:  # 매핑 실패(미상 코드)는 조용히 제외
            result.append({"sido": sido, "sido_code": code2})
    return result

_SIGUNGU_SQL = """
SELECT DISTINCT r.region_code, r.name
FROM bicycle_facility bf
JOIN region r ON r.region_code = bf.region_code
WHERE bf.region_code LIKE %s
ORDER BY r.region_code
"""


def list_bicycle_sigungu(conn, sido_code: str) -> list[dict]:
    """특정 시/도(2자리 코드) 내에서 자전거 시설이 있는 시/군/구 목록을 반환한다."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(_SIGUNGU_SQL, (sido_code + "%",))
        return cur.fetchall()
