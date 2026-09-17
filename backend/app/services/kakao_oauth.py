"""
카카오 로그인(OAuth) 클라이언트

인가 코드를 카카오 토큰으로 바꾸고, 그 토큰으로 회원 정보를 조회한다.
카카오 토큰은 회원 정보를 읽는 데만 쓰고 저장하지 않는다. 이후 인증은 우리 JWT(auth_token.py)로 한다.
"""

from dataclasses import dataclass

import httpx

from ..core.config import settings

_TOKEN_URL = "https://kauth.kakao.com/oauth/token"
_USER_URL = "https://kapi.kakao.com/v2/user/me"

# 다시 로그인하면 해결되는 오류 코드만 적는다. 목록에 없는 코드는 모두 설정 오류나 카카오 쪽 문제로 본다.
#   KOE320: 인가 코드가 만료됐거나 이미 쓰였다.
# error 값으로 나누지 않는 이유: redirect_uri 불일치(KOE303)도 KOE320과 같은 invalid_grant로 온다.
#   error로 나누면 설정 오류가 "다시 로그인하세요"로 나가고, 몇 번을 다시 해도 해결되지 않는다.
_USER_ERROR_CODES = {"KOE320"}


class KakaoAuthError(Exception):
    """인가 코드가 유효하지 않다. 다시 로그인하면 해결된다."""


class KakaoUpstreamError(Exception):
    """설정 오류나 카카오 서버 문제. 다시 로그인해도 해결되지 않는다."""


@dataclass(frozen=True)
class KakaoUser:
    kakao_id: int
    nickname: str | None


def is_configured() -> bool:
    return bool(
        settings.kakao_login_client_id
        and settings.kakao_login_client_secret
        and settings.kakao_login_redirect_uri
    )


def exchange_code(code: str) -> str:
    """인가 코드를 카카오 액세스 토큰으로 바꾼다.

    redirect_uri는 요청 값이 아니라 서버 설정값을 쓴다. 인가 요청 때와 한 글자라도 다르면 KOE303이 난다.
    """
    data = {
        "grant_type": "authorization_code",
        "client_id": settings.kakao_login_client_id,
        "client_secret": settings.kakao_login_client_secret,
        "redirect_uri": settings.kakao_login_redirect_uri,
        "code": code,
    }
    try:
        resp = httpx.post(_TOKEN_URL, data=data, timeout=10)
    except httpx.HTTPError as e:
        raise KakaoUpstreamError(f"토큰 요청 실패: {type(e).__name__}") from e

    body = _json_object(resp)
    if resp.is_success:
        token = body.get("access_token")
        if not isinstance(token, str) or not token:
            raise KakaoUpstreamError("토큰 응답에 access_token이 없음")
        return token

    error_code = body.get("error_code")
    if resp.status_code < 500 and error_code in _USER_ERROR_CODES:
        raise KakaoAuthError(error_code)
    # error_description은 남기지 않는다. KOE320 등의 설명에 인가 코드 값이 들어 있다.
    raise KakaoUpstreamError(
        f"토큰 교환 실패: status={resp.status_code} error={body.get('error')} error_code={error_code}"
    )


def fetch_user(access_token: str) -> KakaoUser:
    """카카오 액세스 토큰으로 회원번호와 닉네임을 조회한다. 프로필 사진은 받지 않는다."""
    try:
        resp = httpx.get(_USER_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
    except httpx.HTTPError as e:
        raise KakaoUpstreamError(f"회원 정보 요청 실패: {type(e).__name__}") from e

    body = _json_object(resp)
    if not resp.is_success:
        raise KakaoUpstreamError(f"회원 정보 조회 실패: status={resp.status_code} code={body.get('code')}")

    kakao_id = body.get("id")
    # bool은 int의 하위 타입이라 따로 거른다.
    if not isinstance(kakao_id, int) or isinstance(kakao_id, bool):
        raise KakaoUpstreamError("회원 정보 응답에 id가 없음")

    profile = (body.get("kakao_account") or {}).get("profile") or {}
    return KakaoUser(kakao_id=kakao_id, nickname=profile.get("nickname"))


def _json_object(resp: httpx.Response) -> dict:
    # 카카오 앞단의 프록시 오류 페이지처럼 JSON이 아닌 응답도 올 수 있다.
    try:
        body = resp.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}
