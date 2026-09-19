"""
로그인 토큰(JWT) 발급과 검증

리프레시 토큰은 두지 않는다. 만료되면 다시 로그인한다.
JWT의 sid가 DB의 로그인 세션과 연결되어 있어야 유효하다. 로그아웃하면 해당 세션을 삭제한다.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt

from ..core.config import settings

ACCESS_TOKEN_TTL = timedelta(days=7)
_ALGORITHM = "HS256"
# HS256 키는 해시 출력 길이(32바이트) 이상이어야 한다. 짧은 키는 무차별 대입으로 풀릴 수 있다.
_MIN_SECRET_BYTES = 32


class InvalidTokenError(Exception):
    """토큰이 없거나, 만료됐거나, 위조됐거나, 내용이 올바르지 않다."""


@dataclass(frozen=True)
class AuthClaims:
    user_id: int
    session_id: UUID


def is_configured() -> bool:
    # 빈 키로 서명하면 누구나 토큰을 만들 수 있으므로 발급과 검증을 모두 막는다.
    return len(settings.jwt_secret.encode()) >= _MIN_SECRET_BYTES


def create_access_token(user_id: int, session_id: UUID, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    # PyJWT 2.10부터 sub가 문자열이 아니면 검증에서 거절하므로 문자열로 넣는다.
    payload = {"sub": str(user_id), "sid": str(session_id), "iat": now, "exp": now + ACCESS_TOKEN_TTL}
    return jwt.encode(payload, settings.jwt_secret, algorithm=_ALGORITHM)


def decode_access_token(token: str) -> AuthClaims:
    """토큰을 검증하고 회원 id와 로그인 세션 id를 돌려준다."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[_ALGORITHM],
            options={"require": ["sub", "sid", "iat", "exp"]},
        )
        if not isinstance(payload["sid"], str):
            raise ValueError
        return AuthClaims(user_id=int(payload["sub"]), session_id=UUID(payload["sid"]))
    except (jwt.InvalidTokenError, ValueError, TypeError) as e:
        raise InvalidTokenError from e
