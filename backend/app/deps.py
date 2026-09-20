from contextlib import contextmanager
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db.supabase import get_db_connection
from .crud import user as user_crud
from .services import auth_token
from .core.config import settings

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


@dataclass(frozen=True)
class CurrentUser:
    id: int
    nickname: str | None
    bio: str | None
    kakao_id: int
    session_id: UUID


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> CurrentUser:
    """JWT와 DB 세션·회원 행을 검증하고 현재 회원을 돌려주는 FastAPI 의존성.

    토큰을 먼저 확인하므로 위조되거나 만료된 요청은 DB에 연결하지 않는다.
    이 의존성을 쓰는 라우터가 get_db까지 받으면 요청 하나가 연결을 둘 잡는다.
    인증이 필요한 라우터는 get_db 대신 본문에서 db_connection()을 직접 쓴다.
    """
    if not auth_token.is_configured():
        print("[ERROR] JWT_SECRET이 비어 있거나 32바이트보다 짧습니다.")
        raise HTTPException(status_code=503, detail="지금은 로그인 기능을 쓸 수 없습니다. 잠시 후 다시 시도해 주세요.")
    if credentials is None:
        raise unauthorized_error()
    try:
        claims = auth_token.decode_access_token(credentials.credentials)
    except auth_token.InvalidTokenError:
        raise unauthorized_error()

    with db_connection() as conn:
        user = user_crud.get_authenticated_user(
            conn,
            user_id=claims.user_id,
            session_id=claims.session_id,
        )
    if user is None:
        raise unauthorized_error()
    return CurrentUser(**user, session_id=claims.session_id)


def unauthorized_error() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="로그인이 필요합니다.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_record_features() -> None:
    """완주 기록·기록 카드 API를 켜 둔 환경에서만 통과시킨다(방침 시행 전에는 막는다)."""
    if not settings.record_features_enabled:
        raise HTTPException(status_code=503, detail="아직 제공하지 않는 기능입니다.")
