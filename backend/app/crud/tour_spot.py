from psycopg2.extras import RealDictCursor

DETAIL_TABLE_MAP = {
    "12": "attraction",
    "14": "attraction",
    "32": "accommodation",
    "38": "attraction",
    "39": "restaurant",
}

DETAIL_COLUMNS = {
    "attraction": ["info_center", "rest_date", "use_time", "parking", "use_fee", "sale_item"],
    "accommodation": ["checkin_time", "checkout_time", "parking", "reservation_url"],
    "restaurant": ["first_menu", "treat_menu", "open_time", "rest_date"],
}


def get_tour_spot_by_id(conn, content_id: str) -> dict | None:
    """단건 조회 — tour_spot + 타입별 상세 테이블 JOIN"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
                content_id, content_type_id, tour_spot_title,
                addr1, addr2, map_x, map_y, first_image, region_code,
                created_at, synced_at
            FROM tour_spot
            WHERE content_id = %s
            """,
            (content_id,),
        )
        spot = cur.fetchone()
        if not spot:
            return None

        detail_table = DETAIL_TABLE_MAP.get(spot["content_type_id"])
        if not detail_table:
            return {**spot, "detail": {}}

        cols_sql = ", ".join(f"d.{c}" for c in DETAIL_COLUMNS[detail_table])
        cur.execute(
            f"SELECT {cols_sql} FROM {detail_table} d WHERE d.content_id = %s",
            (content_id,),
        )
        detail = cur.fetchone()
        return {**spot, "detail": dict(detail) if detail else {}}


def get_tour_spots(
    conn,
    content_type_id: str | None = None,
    region_code: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[int, list[dict]]:
    """목록 조회 — 필터 + 페이지네이션"""
    filters = []
    params: list = []

    if content_type_id:
        filters.append("content_type_id = %s")
        params.append(content_type_id)
    if region_code:
        filters.append("region_code = %s")
        params.append(region_code)

    where = f"WHERE {' AND '.join(filters)}" if filters else ""

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(f"SELECT COUNT(*) FROM tour_spot {where}", params)
        total = cur.fetchone()["count"]

        cur.execute(
            f"""
            SELECT
                content_id, content_type_id, tour_spot_title,
                addr1, map_x, map_y, first_image, region_code
            FROM tour_spot
            {where}
            ORDER BY tour_spot_title
            LIMIT %s OFFSET %s
            """,
            params + [limit, offset],
        )
        rows = cur.fetchall()

    return total, [dict(r) for r in rows]