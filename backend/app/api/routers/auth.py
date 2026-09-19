from fastapi import APIRouter, HTTPException, Request

from ...crud import user as user_crud
from ...deps import db_connection
from ...schemas.user import KakaoLoginRequest, LoginResponse, UserOut
from ...services import auth_token, kakao_oauth
from ...services.rate_limit import SlidingWindowLimiter, client_key

router = APIRouter(prefix="/api/auth", tags=["auth"])

# 같은 IP에서 10분에 60회까지. 공용 IP(학교, 회사, 모바일 캐리어 NAT) 뒤에 여러 사람이 있어도
# 막히지 않을 만큼 넉넉하게 두고, 반복 호출만 끊는다. 한 번의 로그인은 한 번 호출한다.
# 메모리 기반이라 서버 재시작 시 초기화된다 (services/rate_limit.py 참고).
login_limiter = SlidingWindowLimiter(max_requests=60, window_seconds=600)


@router.post("/kakao", response_model=LoginResponse)
def login_with_kakao(body: KakaoLoginRequest, request: Request):
    """카카오 인가 코드로 로그인한다. 처음 로그인하면 회원을 만든다."""
    if not (kakao_oauth.is_configured() and auth_token.is_configured()):
        print("[ERROR] 카카오 로그인 설정이 비어 있거나 JWT_SECRET이 32바이트보다 짧습니다.")
        raise HTTPException(status_code=503, detail="지금은 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.")

    # 카카오 토큰 교환 전에 막는다. 반복 요청이 카카오 호출과 스레드 점유로 이어지지 않게 한다.
    key = client_key(request)
    if key is None:
        # 이용자 IP를 확인하지 못한 요청은 제한하지 않는다(fail open). 문의와 달리 한 키로 묶으면
        # 헤더 검증이 깨진 동안 전체 이용자가 로그인하지 못한다. 설정이 깨진 신호이므로 로그를 남긴다.
        print("[ERROR] 로그인 요청 제한을 건너뜁니다: 이용자 IP를 확인하지 못했습니다(CF-Connecting-IP 확인 필요).")
    elif not login_limiter.allow(key):
        raise HTTPException(status_code=429, detail="로그인을 너무 자주 시도했어요. 잠시 후 다시 시도해 주세요.")

    try:
        kakao_token = kakao_oauth.exchange_code(body.code)
        kakao_user = kakao_oauth.fetch_user(kakao_token)
    except kakao_oauth.KakaoAuthError:
        raise HTTPException(status_code=401, detail="로그인 요청이 만료되었습니다. 다시 로그인해 주세요.")
    except kakao_oauth.KakaoUpstreamError as e:
        print(f"[ERROR] 카카오 로그인 실패: {e}")
        raise HTTPException(status_code=502, detail="카카오 로그인을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.")

    # 카카오 확인이 끝난 요청만 DB에 연결한다(inquiries.py와 같은 이유).
    with db_connection() as conn:
        user = user_crud.upsert_kakao_user(conn, kakao_id=kakao_user.kakao_id, nickname=kakao_user.nickname)
    return LoginResponse(access_token=auth_token.create_access_token(user["id"]), user=UserOut(**user))
