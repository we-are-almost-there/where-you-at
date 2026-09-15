from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from ...crud import inquiry as inquiry_crud
from ...deps import get_db
from ...schemas.inquiry import InquiryCreate, InquiryCreated
from ...services.inquiry_notify import notify_new_inquiry
from ...services.rate_limit import SlidingWindowLimiter

router = APIRouter(prefix="/api/inquiries", tags=["inquiries"])

# 같은 IP에서 10분에 3건까지. 정상 이용자가 고쳐 보내는 정도는 허용하고 연속 전송만 막는다.
# 메모리 기반이라 서버 재시작 시 초기화되고 서버가 여러 대면 각자 센다 (services/rate_limit.py 참고).
inquiry_limiter = SlidingWindowLimiter(max_requests=3, window_seconds=600)


def _client_key(request: Request) -> str:
    # X-Forwarded-For를 여기서 직접 읽지 않는다. 그 헤더는 누구나 바꿔 보낼 수 있어서, 믿으면
    # 요청마다 값을 바꾸는 것만으로 제한을 피한다.
    # 프록시 뒤에 배포하면 client.host가 프록시 IP가 되어 모든 이용자가 한 묶음으로 제한된다.
    # Render는 프록시 주소가 고정되지 않아 FORWARDED_ALLOW_IPS=*를 검토 중인데, 그러면 uvicorn이
    # X-Forwarded-For의 맨 왼쪽 값을 쓴다. Render가 이용자가 보낸 값을 덮어쓰는지 확인한 뒤 정한다
    # (README "배포" 참고).
    return request.client.host if request.client else "unknown"


@router.post("", status_code=201, response_model=InquiryCreated)
def create_inquiry(
    body: InquiryCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    conn=Depends(get_db),
):
    # 숨긴 입력칸이 채워졌으면 봇으로 보고 저장하지 않는다. 성공처럼 응답해야 봇이 다른 방법을 찾지 않는다.
    if body.website:
        return InquiryCreated()

    if not inquiry_limiter.allow(_client_key(request)):
        raise HTTPException(status_code=429, detail="문의를 너무 자주 보냈어요. 잠시 후 다시 시도해 주세요.")

    inquiry_crud.create_inquiry(conn, category=body.category, email=body.email, content=body.content)
    # 저장이 끝난 뒤 보내며, 전송 실패는 서비스 안에서 처리해 접수에 영향을 주지 않는다.
    background_tasks.add_task(
        notify_new_inquiry,
        category=body.category,
        email=body.email,
        content=body.content,
    )
    return InquiryCreated()
