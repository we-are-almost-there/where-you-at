"""
inquiry 테이블 CRUD 함수

race.py와 같은 psycopg2 raw SQL + RealDictCursor 패턴. 조회는 콘솔에서만 하므로 저장 함수만 둔다.
"""

from psycopg2.extras import RealDictCursor


def create_inquiry(conn, *, category: str, email: str, content: str) -> dict:
    """문의를 저장하고 id와 접수 시각(created_at)을 돌려준다.

    consented_at은 저장 시각으로 채운다. 스키마 검증에서 동의(agreed=True)를 확인한 뒤에만
    이 함수가 불리므로, 저장 시각이 곧 동의 시각이다. 실패하면 커밋하지 않고 예외를 올린다
    (get_db가 연결을 닫으면서 트랜잭션도 버려진다).
    """
    query = """
        insert into inquiry (category, email, content, consented_at)
        values (%(category)s, %(email)s, %(content)s, now())
        returning id, created_at
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, {"category": category, "email": email, "content": content})
        row = cur.fetchone()
    conn.commit()
    return row
