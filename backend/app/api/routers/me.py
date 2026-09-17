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
