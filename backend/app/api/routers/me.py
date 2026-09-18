from fastapi import APIRouter, Depends, HTTPException

from ...crud import user as user_crud
from ...deps import db_connection, get_current_user, get_db, unauthorized_error
from ...schemas.user import UserOut
from ...services import kakao_oauth

router = APIRouter(prefix="/api/me", tags=["me"])


# get_current_user를 get_db보다 앞에 둔다. 인증에 실패한 요청은 DB에 연결하지 않는다.
@router.get("", response_model=UserOut)
def read_me(user_id: int = Depends(get_current_user), conn=Depends(get_db)):
    """로그인한 회원 정보. 토큰은 유효하지만 회원 행이 없으면(탈퇴) 401로 로그인을 다시 받게 한다."""
    user = user_crud.get_user(conn, user_id)
    if user is None:
        raise unauthorized_error()
    return user


@router.delete("", status_code=204)
def delete_me(user_id: int = Depends(get_current_user)):
    """회원 탈퇴. 카카오 연결을 해제한 뒤 회원 행을 지운다. 회원에 딸린 데이터는 on delete cascade로 함께 지워진다.

    - 카카오 연결 해제가 실패하면 행을 남기고 502를 돌려준다. 다시 요청하면 처음부터 진행된다.
    - 다만 휴면이거나 없는 계정(-103)은 다시 요청해도 해제되지 않는다. 이때는 경고만 남기고 행을 지운다.
      개인정보 보유 기간을 "탈퇴 시까지"로 안내하므로, 해제할 수 없는 카카오 연결 때문에 우리 데이터 삭제까지
      막지는 않는다.
    - 연결 해제 뒤 행 삭제가 실패해도, 다시 요청하면 카카오가 "이미 해제됨"(-101)을 돌려줘 삭제까지 진행된다.
    - 카카오 응답을 기다리는 동안 DB 연결을 붙잡지 않도록, 조회와 삭제 때만 따로 연결한다.
    - 이미 지운 회원이 다시 요청해도 204다. 401은 토큰이 없거나 만료, 위조된 경우에만 나가므로,
      프론트는 401을 "탈퇴 완료"가 아니라 "다시 로그인 필요"로 본다.
    - 발급한 토큰은 만료 전까지 서명이 유효하지만, 회원 행이 없어 /api/me에서 401이 된다.
    """
    if not kakao_oauth.is_unlink_configured():
        print("[ERROR] KAKAO_LOGIN_ADMIN_KEY가 비어 있어 탈퇴를 처리할 수 없습니다.")
        raise HTTPException(status_code=503, detail="지금은 탈퇴할 수 없습니다. 잠시 후 다시 시도해 주세요.")

    with db_connection() as conn:
        kakao_id = user_crud.get_kakao_id(conn, user_id)
    if kakao_id is None:
        return

    try:
        kakao_oauth.unlink_user(kakao_id)
    except kakao_oauth.KakaoUnlinkUnavailableError as e:
        print(f"[WARN] 카카오 연결 해제를 건너뛰고 탈퇴를 진행합니다: {e}")
    except kakao_oauth.KakaoUpstreamError as e:
        print(f"[ERROR] 카카오 연결 해제 실패: {e}")
        raise HTTPException(status_code=502, detail="탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.")

    with db_connection() as conn:
        user_crud.delete_user(conn, user_id)
