"""
app_user 테이블 CRUD 함수

inquiry.py와 같은 psycopg2 raw SQL + RealDictCursor 패턴.
"""

from datetime import datetime
from uuid import UUID

from psycopg2.extras import RealDictCursor

_USER_COLUMNS = "id, nickname"
_AUTHENTICATED_USER_COLUMNS = "u.id, u.nickname, u.kakao_id"


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


def create_session(conn, *, user_id: int, session_id: UUID, expires_at: datetime) -> None:
    """로그인 세션을 만들고, 같은 회원의 만료된 세션을 함께 정리한다."""
    with conn.cursor() as cur:
        cur.execute(
            "delete from auth_session where user_id = %(user_id)s and expires_at <= now()",
            {"user_id": user_id},
        )
        cur.execute(
            """
            insert into auth_session (id, user_id, expires_at)
            values (%(session_id)s, %(user_id)s, %(expires_at)s)
            """,
            {"session_id": str(session_id), "user_id": user_id, "expires_at": expires_at},
        )
    conn.commit()


def get_authenticated_user(conn, *, user_id: int, session_id: UUID) -> dict | None:
    """만료되지 않은 세션과 회원이 모두 남아 있을 때만 인증할 회원을 돌려준다."""
    query = f"""
        select {_AUTHENTICATED_USER_COLUMNS}
        from auth_session s
        join app_user u on u.id = s.user_id
        where s.id = %(session_id)s
          and s.user_id = %(user_id)s
          and s.expires_at > now()
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, {"session_id": str(session_id), "user_id": user_id})
        return cur.fetchone()


def delete_session(conn, *, user_id: int, session_id: UUID) -> None:
    """현재 로그인 세션만 삭제한다. 이미 사라졌으면 아무것도 하지 않는다."""
    with conn.cursor() as cur:
        cur.execute(
            "delete from auth_session where id = %(session_id)s and user_id = %(user_id)s",
            {"session_id": str(session_id), "user_id": user_id},
        )
    conn.commit()


def get_user_id_by_kakao_id(conn, kakao_id: int) -> int | None:
    """카카오 회원번호로 회원 id를 찾는다. 연결 끊기 웹훅에서 쓴다. 회원이 없으면 None."""
    with conn.cursor() as cur:
        cur.execute("select id from app_user where kakao_id = %(kakao_id)s", {"kakao_id": kakao_id})
        row = cur.fetchone()
    return row[0] if row else None


def delete_user(conn, user_id: int) -> None:
    """회원을 삭제한다. app_user를 참조하는 테이블의 행은 on delete cascade로 함께 지워진다.

    이미 없는 회원이면 아무것도 지우지 않고 끝난다.
    """
    with conn.cursor() as cur:
        cur.execute("delete from app_user where id = %(id)s", {"id": user_id})
    conn.commit()
