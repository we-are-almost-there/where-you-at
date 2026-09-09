from fastapi import HTTPException

from .db.supabase import get_db_connection


def get_db():
    """요청마다 DB 연결을 열고 응답 후 닫는 FastAPI 의존성."""
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
