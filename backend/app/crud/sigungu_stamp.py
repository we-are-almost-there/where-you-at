"""시군구 스탬프 조회·저장. 기존 완주 기록을 조인해 자격을 계산한다."""

from psycopg2.errors import UniqueViolation
from psycopg2.extras import RealDictCursor

from ..sigungu_codes import SIGUNGU_CODES


def list_stamps(conn, *, user_id: int) -> list[dict]:
    """지도에 쓰는 시군구만 반환한다. 찍은 기록이 완주 자격보다 우선한다."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            select target.code as sigungu_code,
                   case when s.id is not null then 'STAMPED'
                        when exists (select 1 from run_record r join course c on c.id = r.course_id
                                     where r.user_id = %(user_id)s and r.is_completed and c.region_code = target.code)
                        then 'AVAILABLE' else 'LOCKED' end as status,
                   s.stamped_at
            from unnest(%(codes)s::text[]) as target(code)
            left join user_sigungu_stamps s
              on s.user_id = %(user_id)s and s.sigungu_code = target.code
            order by target.code
        """, {"user_id": user_id, "codes": list(SIGUNGU_CODES)})
        return cur.fetchall()


def create_stamp(conn, *, user_id: int, code: str) -> tuple[dict | None, bool, int]:
    """완주한 시군구에 직접 찍는다. 중복 INSERT는 기존 행과 시각을 반환한다."""
    params = {"user_id": user_id, "code": code}
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("select 1 from region where region_code = %(code)s", params)
        if cur.fetchone() is None:
            return None, False, 404
        cur.execute("""
            select 1 from run_record r join course c on c.id = r.course_id
            where r.user_id = %(user_id)s and r.is_completed and c.region_code = %(code)s limit 1
        """, params)
        if cur.fetchone() is None:
            return None, False, 409
        # 동시 요청의 UNIQUE 충돌 뒤에도 같은 트랜잭션에서 기존 행을 조회할 수 있게 한다.
        cur.execute("savepoint stamp_insert")
        try:
            cur.execute("""
                insert into user_sigungu_stamps (user_id, sigungu_code)
                values (%(user_id)s, %(code)s) returning sigungu_code, stamped_at
            """, params)
            row = cur.fetchone()
            created = True
        except UniqueViolation as exc:
            cur.execute("rollback to savepoint stamp_insert")
            if exc.diag.constraint_name != "uq_user_sigungu_stamps":
                raise
            cur.execute("""
                select sigungu_code, stamped_at from user_sigungu_stamps
                where user_id = %(user_id)s and sigungu_code = %(code)s
            """, params)
            row = cur.fetchone()
            created = False
        cur.execute("release savepoint stamp_insert")
    conn.commit()
    return row, created, 201 if created else 200
