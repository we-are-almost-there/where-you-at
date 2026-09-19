"""
app_user 테이블 CRUD 함수

inquiry.py와 같은 psycopg2 raw SQL + RealDictCursor 패턴.
"""

from psycopg2.extras import RealDictCursor

_USER_COLUMNS = "id, nickname, bio"


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


def get_user(conn, user_id: int) -> dict | None:
    query = f"select {_USER_COLUMNS} from app_user where id = %(id)s"
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, {"id": user_id})
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


def get_kakao_id(conn, user_id: int) -> int | None:
    """탈퇴할 때 카카오 연결 해제에 쓸 회원번호. 회원이 없으면 None."""
    with conn.cursor() as cur:
        cur.execute("select kakao_id from app_user where id = %(id)s", {"id": user_id})
        row = cur.fetchone()
    return row[0] if row else None


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
