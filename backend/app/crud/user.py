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


def get_user(conn, user_id: int) -> dict | None:
    query = f"select {_USER_COLUMNS} from app_user where id = %(id)s"
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, {"id": user_id})
        return cur.fetchone()


def delete_user(conn, user_id: int) -> None:
    """회원을 삭제한다. app_user를 참조하는 테이블의 행은 on delete cascade로 함께 지워진다.

    이미 없는 회원이면 아무것도 지우지 않고 끝난다.
    """
    with conn.cursor() as cur:
        cur.execute("delete from app_user where id = %(id)s", {"id": user_id})
    conn.commit()
