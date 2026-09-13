from fastapi import APIRouter, Depends, HTTPException, Query

from ...crud import notice as notice_crud
from ...deps import get_db
from ...schemas.notice import NoticeDetail, NoticeListResponse

router = APIRouter(prefix="/api/notices", tags=["notices"])


@router.get("", response_model=NoticeListResponse)
def list_notices(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    conn=Depends(get_db),
):
    rows, total = notice_crud.get_notices(conn, page=page, per_page=per_page)
    return NoticeListResponse(total=total, page=page, per_page=per_page, items=rows)


@router.get("/{notice_id}", response_model=NoticeDetail)
def get_notice(notice_id: int, conn=Depends(get_db)):
    row = notice_crud.get_notice_by_id(conn, notice_id)
    if not row:
        raise HTTPException(status_code=404, detail="공지사항을 찾을 수 없습니다")
    return row
