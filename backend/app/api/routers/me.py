from fastapi import APIRouter, Depends

from ...crud import user as user_crud
from ...deps import get_current_user, get_db, unauthorized_error
from ...schemas.user import UserOut

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
def delete_me(user_id: int = Depends(get_current_user), conn=Depends(get_db)):
    """회원 탈퇴. 회원 행을 지우고, 회원에 딸린 데이터는 on delete cascade로 함께 지워진다.

    카카오 연결 끊기는 하지 않는다(어드민 키가 필요). 다시 로그인하면 새 회원으로 가입된다.
    발급한 토큰은 만료 전까지 서명이 유효하지만, 회원 행이 없어 /api/me에서 401이 된다.

    이미 지운 회원이 다시 요청해도 204다(여러 번 보내도 결과가 같다). 401은 토큰이 없거나
    만료, 위조된 경우에만 나가므로, 프론트는 401을 "탈퇴 완료"가 아니라 "다시 로그인 필요"로 본다.
    """
    user_crud.delete_user(conn, user_id)
