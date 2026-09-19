from fastapi import APIRouter, Depends, HTTPException, Query

from ...crud import saved_course as crud
from ...deps import db_connection, get_current_user, unauthorized_error
from ...schemas.saved_course import SavedCourseCreate, SavedCourseKey, SavedCourseListResponse

router = APIRouter(prefix="/api/me/saved-courses", tags=["me"])

# 인증이 필요한 라우터라 get_db 대신 본문에서 db_connection()을 쓴다.
# 의존성으로 받으면 인증에 실패한 요청도 DB에 연결하고, 요청 하나가 연결을 둘 잡는다(me.py와 같은 이유).


@router.get("", response_model=SavedCourseListResponse)
def list_saved_courses(user_id: int = Depends(get_current_user)):
    """찜한 코스 목록. 최근 찜한 순이며 코스 카드에 필요한 값이 모두 담긴다."""
    with db_connection() as conn:
        return {"courses": crud.list_saved(conn, user_id)}


@router.get("/keys", response_model=list[SavedCourseKey])
def list_saved_course_keys(user_id: int = Depends(get_current_user)):
    """찜한 코스와 종목만. 목록·상세의 하트 상태를 그리는 데 쓴다.

    카드용 목록과 나눈 이유: 하트만 그리면 되는 화면이 썸네일 좌표(코스당 약 40점)까지 받지 않게 한다.
    """
    with db_connection() as conn:
        return crud.list_keys(conn, user_id)


@router.post("", status_code=201)
def add_saved_course(body: SavedCourseCreate, user_id: int = Depends(get_current_user)):
    """찜하기. 이미 찜한 코스도 201이다(연타나 재시도가 오류가 되지 않게).

    get_db 의존성을 쓰지 않는 이유는 위 주석과 같고, 본문 검증에 실패한 요청을 DB에 연결하지 않기 위해서이기도 하다.
    """
    with db_connection() as conn:
        try:
            crud.add(conn, user_id=user_id, course_id=body.course_id, route_type=body.route_type)
        except crud.UnknownRouteError:
            raise HTTPException(status_code=404, detail="해당 코스를 찾을 수 없습니다.")
        except crud.UnknownUserError:
            # 탈퇴한 회원의 토큰이다. 만료 전까지 서명은 유효하므로 여기서 다시 로그인하게 한다(/api/me와 같다).
            raise unauthorized_error()


@router.delete("/{course_id}", status_code=204)
def remove_saved_course(
    course_id: int,
    route_type: str = Query(..., pattern="^(trail|bicycle)$"),
    user_id: int = Depends(get_current_user),
):
    """찜 해제. 찜하지 않은 코스를 해제해도 204다."""
    with db_connection() as conn:
        crud.remove(conn, user_id=user_id, course_id=course_id, route_type=route_type)
