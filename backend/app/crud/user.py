"""
app_user 테이블 CRUD 함수

inquiry.py와 같은 psycopg2 raw SQL + RealDictCursor 패턴.
"""

from datetime import datetime
from uuid import UUID

from psycopg2.extras import RealDictCursor

_USER_COLUMNS = "id, nickname, bio, avatar_key"
# 인증 조회 결과가 deps.CurrentUser의 칸이 된다. 칸을 바꾸면 CurrentUser도 함께 고친다.
_AUTHENTICATED_USER_COLUMNS = "u.id, u.nickname, u.bio, u.avatar_key, u.kakao_id"


def upsert_kakao_user(conn, *, kakao_id: int, nickname: str | None) -> dict:
    """카카오 회원번호로 회원을 찾고, 없으면 새로 만든다.

    닉네임은 처음 가입할 때만 카카오 값을 쓴다. 마이페이지에서 바꾼 닉네임을 다음 로그인이 덮어쓰지 않도록,
    이미 있는 회원은 저장된 닉네임이 비어 있을 때만 카카오 값으로 채운다.
    """
    query = f"""
        insert into app_user (kakao_id, nickname)
        values (%(kakao_id)s, %(nickname)s)
        on conflict (kakao_id) do update
          set nickname = coalesce(app_user.nickname, excluded.nickname)
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


# 마이페이지에서 바꿀 수 있는 칸. 여기 없는 이름은 SQL에 넣지 않는다.
_EDITABLE_COLUMNS = ("nickname", "bio")


def update_profile(conn, user_id: int, fields: dict) -> dict | None:
    """닉네임·한 줄 소개 중 넘어온 칸만 바꾼다. 회원이 없으면(탈퇴) None.

    칸 이름은 _EDITABLE_COLUMNS에서만 골라 SQL에 넣고, 값은 매개변수로 넘긴다.
    """
    columns = [name for name in _EDITABLE_COLUMNS if name in fields]
    if not columns:
        raise ValueError("바꿀 칸이 없습니다.")
    assignments = ", ".join(f"{name} = %({name})s" for name in columns)
    query = f"""
        update app_user set {assignments}
        where id = %(id)s
        returning {_USER_COLUMNS}
    """
    params = {name: fields[name] for name in columns}
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, {"id": user_id, **params})
        row = cur.fetchone()
    conn.commit()
    return row


def set_avatar(conn, user_id: int, avatar_key: str | None) -> tuple[dict | None, str | None]:
    """프로필 사진 키를 바꾸고 (갱신된 회원, 이전 키)를 돌려준다.

    이전 키를 잠근 뒤 바꾸므로 동시에 두 업로드를 완료해도 각 요청이 자신이 교체한 파일만 정리한다.
    회원이 이미 탈퇴했으면 (None, None).
    """
    previous = lock_user_for_update(conn, user_id)
    if previous is None:
        conn.rollback()
        return None, None
    row = set_avatar_locked(conn, user_id, avatar_key)
    conn.commit()
    return row, previous["avatar_key"]


def lock_user_for_update(conn, user_id: int) -> dict | None:
    """업로드와 탈퇴가 공유하는 회원 행 잠금. 호출자는 트랜잭션 종료까지 연결을 유지한다."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("select id, avatar_key from app_user where id = %(id)s for update", {"id": user_id})
        return cur.fetchone()


def set_avatar_locked(conn, user_id: int, avatar_key: str | None) -> dict | None:
    """이미 잠근 회원의 사진 키를 바꾼다. commit은 잠금을 관리하는 호출자가 수행한다."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            f"update app_user set avatar_key = %(avatar_key)s where id = %(id)s returning {_USER_COLUMNS}",
            {"id": user_id, "avatar_key": avatar_key},
        )
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
