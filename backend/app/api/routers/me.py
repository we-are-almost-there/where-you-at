from fastapi import APIRouter, Depends, HTTPException

from ...crud import user as user_crud
from ...deps import CurrentUser, db_connection, get_current_user, unauthorized_error
from ...schemas.user import UserOut, UserUpdate
from ...services import kakao_oauth

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("", response_model=UserOut)
def read_me(current_user: CurrentUser = Depends(get_current_user)):
    """로그인한 회원 정보."""
    return UserOut(id=current_user.id, nickname=current_user.nickname, bio=current_user.bio)


@router.patch("", response_model=UserOut)
def update_me(body: UserUpdate, current_user: CurrentUser = Depends(get_current_user)):
    """프로필(닉네임·한 줄 소개) 수정. 보낸 칸만 바꾼다. 인증 뒤 회원 행이 사라졌으면(탈퇴) 401로 로그인을 다시 받게 한다.

    인증(get_current_user)은 세션을 확인하려고 DB에 한 번 연결한다. 수정용 연결은 get_db 의존성이 아니라 본문에서 연다.
    의존성은 본문 검증보다 먼저 풀려서, get_db를 쓰면 값이 잘못된 요청도 연결을 하나 더 잡는다.
    """
    with db_connection() as conn:
        user = user_crud.update_profile(conn, current_user.id, body.changes())
    if user is None:
        raise unauthorized_error()
    return user


@router.delete("", status_code=204)
def delete_me(current_user: CurrentUser = Depends(get_current_user)):
    """회원 탈퇴. 카카오 연결을 해제한 뒤 회원 행을 지운다. 회원에 딸린 데이터는 on delete cascade로 함께 지워진다.

    - 카카오 연결 해제가 실패하면 행을 남기고 502를 돌려준다. 다시 요청하면 처음부터 진행된다.
    - 다만 휴면이거나 없는 계정(-103)은 다시 요청해도 해제되지 않는다. 이때는 경고만 남기고 행을 지운다.
      개인정보 보유 기간을 "탈퇴 시까지"로 안내하므로, 해제할 수 없는 카카오 연결 때문에 우리 데이터 삭제까지
      막지는 않는다.
    - 연결 해제 뒤 행 삭제가 실패해도, 다시 요청하면 카카오가 "이미 해제됨"(-101)을 돌려줘 삭제까지 진행된다.
    - 카카오 응답을 기다리는 동안 DB 연결을 붙잡지 않도록, 조회와 삭제 때만 따로 연결한다.
    - 회원 행이 삭제되면 로그인 세션도 함께 삭제되어, 이미 지운 회원의 토큰은 모든 인증 API에서 401이다.
    """
    if not kakao_oauth.is_unlink_configured():
        print("[ERROR] KAKAO_LOGIN_ADMIN_KEY가 비어 있어 탈퇴를 처리할 수 없습니다.")
        raise HTTPException(status_code=503, detail="지금은 탈퇴할 수 없습니다. 잠시 후 다시 시도해 주세요.")

    try:
        kakao_oauth.unlink_user(current_user.kakao_id)
    except kakao_oauth.KakaoUnlinkUnavailableError as e:
        print(f"[WARN] 카카오 연결 해제를 건너뛰고 탈퇴를 진행합니다: {e}")
    except kakao_oauth.KakaoUpstreamError as e:
        print(f"[ERROR] 카카오 연결 해제 실패: {e}")
        raise HTTPException(status_code=502, detail="탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.")

    with db_connection() as conn:
        user_crud.delete_user(conn, current_user.id)
