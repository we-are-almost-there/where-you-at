from contextlib import contextmanager

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db.supabase import get_db_connection
from .services import auth_token

# auto_error=False: 헤더가 없을 때 FastAPI 기본 403 대신 아래에서 401을 돌려준다.
_bearer = HTTPBearer(auto_error=False)


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


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> int:
    """Authorization: Bearer 토큰을 검증하고 회원 id를 돌려주는 FastAPI 의존성.

    토큰만 확인하고 회원 행이 남아 있는지는 보지 않는다. 탈퇴한 회원의 토큰도 만료 전까지 통과하므로,
    회원 행이 필요한 곳에서 직접 확인한다(GET /api/me).
    라우터에서 get_db보다 앞에 두면 인증에 실패한 요청은 DB에 연결하지 않는다.
    """
    if not auth_token.is_configured():
        print("[ERROR] JWT_SECRET이 비어 있거나 32바이트보다 짧습니다.")
        raise HTTPException(status_code=503, detail="지금은 로그인 기능을 쓸 수 없습니다. 잠시 후 다시 시도해 주세요.")
    if credentials is None:
        raise unauthorized_error()
    try:
        return auth_token.decode_access_token(credentials.credentials)
    except auth_token.InvalidTokenError:
        raise unauthorized_error()


def unauthorized_error() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="로그인이 필요합니다.",
        headers={"WWW-Authenticate": "Bearer"},
    )
