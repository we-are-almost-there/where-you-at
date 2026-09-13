"""
notice 테이블 조회 CRUD 함수

race.py와 같은 psycopg2 raw SQL + RealDictCursor 패턴.
"""

from psycopg2.extras import RealDictCursor


# 공개 조건. published_at이 비어 있으면 작성 중인 글이고, 미래 시각이면 예약 게시라 둘 다 숨긴다.
# 목록과 상세가 같은 조건을 써야 목록에 없는 글을 id로 직접 열어 보는 일이 생기지 않는다.
_PUBLISHED = "published_at is not null and published_at <= now()"


def get_notices(conn, page: int = 1, per_page: int = 20):
    """공개된 공지 목록 (페이지네이션). (rows, total_count) 반환.

    고정 공지를 먼저 두고, 그 안에서는 최근 게시순으로 정렬한다.
    """
    params = {"limit": per_page, "offset": (page - 1) * per_page}

    query = f"""
        select id, title, is_pinned, published_at
        from notice
        where {_PUBLISHED}
        order by is_pinned desc, published_at desc, id desc
        limit %(limit)s offset %(offset)s
    """
    count_query = f"select count(*) as total from notice where {_PUBLISHED}"

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(count_query)
        total = cur.fetchone()["total"]

        cur.execute(query, params)
        rows = cur.fetchall()

    return rows, total


def get_notice_by_id(conn, notice_id: int):
    """공개된 공지 단건 조회. 없거나 아직 공개 전이면 None."""
    query = f"""
        select id, title, content, is_pinned, published_at
        from notice
        where id = %(id)s and {_PUBLISHED}
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, {"id": notice_id})
        return cur.fetchone()
