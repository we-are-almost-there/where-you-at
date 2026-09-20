"""
saved_course 테이블 CRUD 함수

user.py와 같은 psycopg2 raw SQL + RealDictCursor 패턴.
찜은 "코스 + 종목" 단위라 모든 함수가 course_id와 route_type을 함께 받는다.
"""

from psycopg2 import errors
from psycopg2.extras import RealDictCursor

from . import course as course_crud


class UnknownRouteError(Exception):
    """없는 코스이거나 그 코스에 없는 종목. 라우터가 404로 바꾼다."""


class UnknownUserError(Exception):
    """회원 행이 없다(탈퇴). 토큰은 만료 전까지 유효하므로 라우터가 401로 바꾼다."""


_LIST_SQL = """
SELECT c.id, c.course_title AS title, c.start_address, c.image_url, c.region_code,
       COALESCE(rg.is_population_drop, false) AS is_population_drop_zone,
       s.route_type, s.created_at AS saved_at
FROM saved_course s
JOIN course c ON c.id = s.course_id
LEFT JOIN region rg ON c.region_code = rg.region_code
WHERE s.user_id = %(user_id)s
ORDER BY s.created_at DESC, c.id
"""


def list_saved(conn, user_id: int) -> list[dict]:
    """찜한 코스를 최근 찜한 순으로 반환한다. 코스 카드에 필요한 값이 모두 담긴다.

    같은 코스를 도보와 자전거로 찜했으면 두 항목으로 나온다.
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(_LIST_SQL, {"user_id": user_id})
        rows = cur.fetchall()
    course_crud.attach_card_fields(conn, rows)
    return rows


def list_keys(conn, user_id: int) -> list[dict]:
    """찜한 코스와 종목만 반환한다. 목록·상세의 하트 상태를 그리는 데 쓴다."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "select course_id, route_type from saved_course where user_id = %(user_id)s",
            {"user_id": user_id},
        )
        return cur.fetchall()


def add(conn, *, user_id: int, course_id: int, route_type: str) -> None:
    """찜을 추가한다. 이미 찜했으면 아무것도 하지 않는다(연타와 재시도가 오류가 되지 않게).

    코스·종목과 회원은 따로 조회하지 않고 외래키 위반으로 구분한다. 정상 요청의 왕복을 늘리지 않기 위해서다.
    """
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into saved_course (user_id, course_id, route_type)
                values (%(user_id)s, %(course_id)s, %(route_type)s)
                on conflict do nothing
                """,
                {"user_id": user_id, "course_id": course_id, "route_type": route_type},
            )
    except errors.ForeignKeyViolation as e:
        conn.rollback()
        if e.diag.constraint_name == "saved_course_user_fk":
            raise UnknownUserError from e
        raise UnknownRouteError from e
    conn.commit()


def remove(conn, *, user_id: int, course_id: int, route_type: str) -> None:
    """찜을 지운다. 찜하지 않은 것을 지워도 아무것도 하지 않는다."""
    with conn.cursor() as cur:
        cur.execute(
            """
            delete from saved_course
            where user_id = %(user_id)s and course_id = %(course_id)s and route_type = %(route_type)s
            """,
            {"user_id": user_id, "course_id": course_id, "route_type": route_type},
        )
    conn.commit()
