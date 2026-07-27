from psycopg2.extras import RealDictCursor


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