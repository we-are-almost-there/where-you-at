from fastapi import APIRouter, Depends, HTTPException

from ...deps import get_db
from ...crud import support as crud
from ...services.refund_calculator import calculate_refund
from ...schemas.support import (
    SupportSummary, SupportDetail, ChecklistItem,
    CalculateRequest, CalculateResponse,
)

router = APIRouter(prefix="/api/support", tags=["support"])


@router.get("", response_model=list[SupportSummary])
def list_support(region_code: str, conn=Depends(get_db)):
    return crud.get_support_list(conn, region_code)


# 반드시 /{id} 보다 위에 둬야 함(아래에 두면 "regions"가 id로 잡혀 422 에러 발생)
@router.get("/regions", response_model=list[str])
def list_active_regions(conn=Depends(get_db)):
    """지금 신청 가능한 제도가 있는 지역 코드 — 지도에서 색칠 대상 판정에 사용."""
    return crud.get_active_region_codes(conn)


@router.get("/{id}", response_model=SupportDetail)
def get_support(id: int, conn=Depends(get_db)):
    row = crud.get_support_detail(conn, id)
    if not row:
        raise HTTPException(status_code=404, detail="Support not found")
    return row


@router.post("/calculate", response_model=CalculateResponse)
def calculate(req: CalculateRequest, conn=Depends(get_db)):
    policies = crud.get_policies_for_calc(conn, req.region_code)
    return calculate_refund(policies, req.spent_by_category, req.stay_duration)