from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from ...crud import inquiry as inquiry_crud
from ...deps import db_connection
from ...schemas.inquiry import InquiryCreate, InquiryCreated
from ...services.inquiry_notify import notify_new_inquiry
from ...services.rate_limit import SlidingWindowLimiter, client_key

router = APIRouter(prefix="/api/inquiries", tags=["inquiries"])

# 같은 IP에서 10분에 3건까지. 정상 이용자가 고쳐 보내는 정도는 허용하고 연속 전송만 막는다.
# 메모리 기반이라 서버 재시작 시 초기화되고 서버가 여러 대면 각자 센다 (services/rate_limit.py 참고).
inquiry_limiter = SlidingWindowLimiter(max_requests=3, window_seconds=600)

# 이용자 IP를 확인하지 못한 요청은 모두 이 한 키로 묶어 함께 막는다(fail closed).
# 헤더 누락이나 변조가 요청 제한 우회로 이어지는 것보다, 일부 요청이 함께 제한되는 쪽이 안전하다.
# 문의는 막혀도 대체 수단이 있다. 로그인은 반대로 정한다(services/rate_limit.py client_key 참고).
_UNVERIFIED_CLOUDFLARE_CLIENT = "unverified-cloudflare-client"


@router.post("", status_code=201, response_model=InquiryCreated)
def create_inquiry(
    body: InquiryCreate,
    request: Request,
    background_tasks: BackgroundTasks,
):
    # 숨긴 입력칸이 채워졌으면 봇으로 보고 저장하지 않는다. 성공처럼 응답해야 봇이 다른 방법을 찾지 않는다.
    if body.website:
        return InquiryCreated()

    if not inquiry_limiter.allow(client_key(request) or _UNVERIFIED_CLOUDFLARE_CLIENT):
        raise HTTPException(status_code=429, detail="문의를 너무 자주 보냈어요. 잠시 후 다시 시도해 주세요.")

    # 저장할 요청만 DB에 연결한다. 의존성(get_db)으로 받으면 위 두 검사보다 먼저 연결이 열려,
    # 거절이 확정된 반복 요청도 매번 연결 비용을 쓰고 DB 장애 때는 201·429 대신 503이 나간다.
    with db_connection() as conn:
        inquiry_crud.create_inquiry(conn, category=body.category, email=body.email, content=body.content)
    # 저장이 끝난 뒤 보내며, 전송 실패는 서비스 안에서 처리해 접수에 영향을 주지 않는다.
    background_tasks.add_task(
        notify_new_inquiry,
        category=body.category,
        email=body.email,
        content=body.content,
    )
    return InquiryCreated()
