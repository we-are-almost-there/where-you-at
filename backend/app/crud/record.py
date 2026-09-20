"""
run_record, record_card 테이블 CRUD 함수

user.py와 같은 psycopg2 raw SQL + RealDictCursor 패턴.
"""

from psycopg2.extras import RealDictCursor

# 조회 결과가 schemas/record.py의 RunRecordOut 칸이 된다. 칸을 바꾸면 RunRecordOut도 함께 고친다.
# numeric은 psycopg2가 Decimal로 돌려주므로 float로 바꿔 JSON 직렬화 문제를 피한다.
# 쓰는 쿼리는 run_record를 r, course를 c로 별칭한다.
_RECORD_COLUMNS = """
    r.id,
    r.course_id,
    c.course_title as course_name,
    r.route_type,
    r.distance_km::float8 as distance_km,
    r.duration_ms,
    r.pace_sec_per_km::float8 as pace_sec_per_km,
    r.finished_at
"""


def create_record(
    conn,
    *,
    user_id: int,
    course_id: int,
    route_type: str,
    distance_km: float,
    duration_ms: int,
    pace_sec_per_km: float | None,
    finished_at,
) -> dict | None:
    """완주 기록을 저장하고 코스 이름이 붙은 행을 돌려준다. 코스가 없으면 None."""
    # 코스가 없으면 insert ... select가 0행이라 FK 오류 없이 None으로 끝난다.
    query = f"""
        with inserted as (
            insert into run_record
                (user_id, course_id, route_type, distance_km, duration_ms, pace_sec_per_km, finished_at)
            select %(user_id)s, c.id, %(route_type)s, %(distance_km)s, %(duration_ms)s,
                   %(pace_sec_per_km)s, %(finished_at)s
            from course c
            join course_route cr on cr.course_id = c.id and cr.route_type = %(route_type)s
            where c.id = %(course_id)s
            returning *
        )
        select {_RECORD_COLUMNS}
        from inserted r
        join course c on c.id = r.course_id
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            query,
            {
                "user_id": user_id,
                "course_id": course_id,
                "route_type": route_type,
                "distance_km": distance_km,
                "duration_ms": duration_ms,
                "pace_sec_per_km": pace_sec_per_km,
                "finished_at": finished_at,
            },
        )
        row = cur.fetchone()
    conn.commit()
    return row


def list_records(conn, *, user_id: int) -> tuple[int, list[dict]]:
    """내 완주 기록을 최근 순으로 돌려준다. (전체 개수, 행 목록)"""
    query = f"""
        select {_RECORD_COLUMNS}
        from run_record r
        join course c on c.id = r.course_id
        where r.user_id = %(user_id)s
        order by r.finished_at desc, r.id desc
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, {"user_id": user_id})
        rows = cur.fetchall()
    return len(rows), rows


# 카드 조회 결과: card_id, image_key, card_created_at + 기록 칸(_RECORD_COLUMNS).
# 라우터가 이 평평한 행을 RecordCardOut(중첩 record)으로 조립한다.
_CARD_COLUMNS = f"""
    k.id as card_id,
    k.image_key,
    k.created_at as card_created_at,
    {_RECORD_COLUMNS}
"""


# 사용자당 저장할 수 있는 기록 카드 수. 5MB 상한과 곱해 사용자별 최대 저장량이 정해진다.
MAX_CARDS_PER_USER = 100

CARD_QUOTA_EXCEEDED = "quota_exceeded"


def create_card(conn, *, user_id: int, record_id: int, image_key: str) -> dict | str | None:
    """기록 카드를 저장한다.

    내 기록이 아니거나 없으면 None, 사용자당 상한을 넘으면 CARD_QUOTA_EXCEEDED.
    같은 사용자의 저장을 advisory lock으로 직렬화해, 동시 요청이 함께 상한을 통과하지 못하게 한다.
    """
    query = f"""
        with inserted as (
            insert into record_card (user_id, record_id, image_key)
            select %(user_id)s, r.id, %(image_key)s
            from run_record r
            where r.id = %(record_id)s and r.user_id = %(user_id)s
              and (select count(*) from record_card where user_id = %(user_id)s) < %(max_cards)s
            returning *
        )
        select {_CARD_COLUMNS}
        from inserted k
        join run_record r on r.id = k.record_id
        join course c on c.id = r.course_id
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # 트랜잭션이 끝나면 자동으로 풀린다. 락 키는 카드 저장 전용 네임스페이스(첫 인자)와 회원 id.
        cur.execute("select pg_advisory_xact_lock(%(ns)s, %(user_id)s)", {"ns": 1201, "user_id": user_id})
        cur.execute(
            query,
            {"user_id": user_id, "record_id": record_id, "image_key": image_key, "max_cards": MAX_CARDS_PER_USER},
        )
        row = cur.fetchone()
        if row is None:
            # 0행이 "내 기록 아님"인지 "상한 초과"인지 구분한다.
            cur.execute(
                "select count(*) as n from record_card where user_id = %(user_id)s", {"user_id": user_id}
            )
            over = cur.fetchone()["n"] >= MAX_CARDS_PER_USER
    conn.commit()
    if row is None:
        return CARD_QUOTA_EXCEEDED if over else None
    return row


def list_cards(conn, *, user_id: int) -> tuple[int, list[dict]]:
    """내 기록 카드를 최근 순으로 돌려준다. (전체 개수, 행 목록)"""
    query = f"""
        select {_CARD_COLUMNS}
        from record_card k
        join run_record r on r.id = k.record_id
        join course c on c.id = r.course_id
        where k.user_id = %(user_id)s
        order by k.created_at desc, k.id desc
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, {"user_id": user_id})
        rows = cur.fetchall()
    return len(rows), rows


def record_exists(conn, *, user_id: int, record_id: int) -> bool:
    """내 기록인지 확인한다."""
    with conn.cursor() as cur:
        cur.execute(
            "select 1 from run_record where id = %(record_id)s and user_id = %(user_id)s",
            {"record_id": record_id, "user_id": user_id},
        )
        return cur.fetchone() is not None

    
def count_cards(conn, *, user_id: int) -> int:
    with conn.cursor() as cur:
        cur.execute("select count(*) from record_card where user_id = %(user_id)s", {"user_id": user_id})
        return cur.fetchone()[0]
