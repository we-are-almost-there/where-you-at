from .db.supabase import get_db_connection


def get_db():
    """요청마다 DB 연결을 열고 응답 후 닫는 FastAPI 의존성."""
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()
