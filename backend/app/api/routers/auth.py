from fastapi import APIRouter, HTTPException

from ...crud import user as user_crud
from ...deps import db_connection
from ...schemas.user import KakaoLoginRequest, LoginResponse, UserOut
from ...services import auth_token, kakao_oauth

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/kakao", response_model=LoginResponse)
def login_with_kakao(body: KakaoLoginRequest):
    """카카오 인가 코드로 로그인한다. 처음 로그인하면 회원을 만든다."""
    if not (kakao_oauth.is_configured() and auth_token.is_configured()):
        print("[ERROR] 카카오 로그인 설정이 비어 있거나 JWT_SECRET이 32바이트보다 짧습니다.")
        raise HTTPException(status_code=503, detail="지금은 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.")

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
