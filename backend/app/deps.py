from contextlib import contextmanager

from fastapi import HTTPException

from .db.supabase import get_db_connection


@contextmanager
def db_connection():
    """DB 연결을 열고 블록이 끝나면 닫는다. 연결할 수 없으면 503을 올린다.

    의존성(get_db)으로 받으면 라우터 본문보다 먼저 연결이 열린다. 검사를 통과한 뒤에만
    연결이 필요한 라우터(1:1 문의 접수)는 이 함수를 직접 쓴다.
    """
    # get_db_connection은 실패해도 예외를 올리지 않고 None을 돌려준다(수집 스크립트들이
    # `if not conn: return` 규약에 기대고 있어 그대로 뒀다). 여기서 걸러내지 않으면
    # None이 라우터로 넘어가 conn.cursor()에서 AttributeError로 터지고, finally의
    # conn.close()도 같은 이유로 실패해 원래 원인(DB 연결 불가)이 가려진다.
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(status_code=503, detail="데이터베이스에 연결할 수 없습니다.")

    try:
        yield conn
    finally:
        conn.close()


def get_db():
    """요청마다 DB 연결을 열고 응답 후 닫는 FastAPI 의존성."""
    with db_connection() as conn:
        yield conn
