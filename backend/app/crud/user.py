"""
app_user 테이블 CRUD 함수

inquiry.py와 같은 psycopg2 raw SQL + RealDictCursor 패턴.
"""

from psycopg2.extras import RealDictCursor

_USER_COLUMNS = "id, nickname"


def upsert_kakao_user(conn, *, kakao_id: int, nickname: str | None) -> dict:
    """카카오 회원번호로 회원을 찾아 닉네임을 갱신하고, 없으면 새로 만든다."""
    query = f"""
        insert into app_user (kakao_id, nickname)
        values (%(kakao_id)s, %(nickname)s)
        on conflict (kakao_id) do update
          set nickname = excluded.nickname
        returning {_USER_COLUMNS}
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, {"kakao_id": kakao_id, "nickname": nickname})
        row = cur.fetchone()
    conn.commit()
    return row
