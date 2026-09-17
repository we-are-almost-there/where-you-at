from ipaddress import IPv6Address, ip_address, ip_network

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from ...core.config import settings
from ...crud import inquiry as inquiry_crud
from ...deps import db_connection
from ...schemas.inquiry import InquiryCreate, InquiryCreated
from ...services.inquiry_notify import notify_new_inquiry
from ...services.rate_limit import SlidingWindowLimiter

router = APIRouter(prefix="/api/inquiries", tags=["inquiries"])

# 같은 IP에서 10분에 3건까지. 정상 이용자가 고쳐 보내는 정도는 허용하고 연속 전송만 막는다.
# 메모리 기반이라 서버 재시작 시 초기화되고 서버가 여러 대면 각자 센다 (services/rate_limit.py 참고).
inquiry_limiter = SlidingWindowLimiter(max_requests=3, window_seconds=600)

_UNVERIFIED_CLOUDFLARE_CLIENT = "unverified-cloudflare-client"


def _client_key(request: Request) -> str:
    # X-Forwarded-For는 사용자가 미리 넣은 값을 Cloudflare가 보존할 수 있으므로 절대 읽지 않는다.
    # Render 공개 트래픽은 Cloudflare를 거치며, Cloudflare는 원본 서버로 보내는
    # CF-Connecting-IP를 실제 접속 IP 한 개로 설정한다. 이 배포 경계를 확인한 Render에서만
    # TRUST_CLOUDFLARE_IP_HEADER=true로 켠다(README "배포" 참고).
    if settings.trust_cloudflare_ip_header:
        values = request.headers.getlist("cf-connecting-ip")
        if len(values) != 1:
            return _UNVERIFIED_CLOUDFLARE_CLIENT
        try:
            # 단일 헤더의 IPv4/IPv6만 허용한다. 쉼표 목록이나 임의 문자열은 한 실패 그룹으로 묶어
            # 헤더 누락·변조가 요청 제한 우회로 이어지지 않게 한다.
            ip = ip_address(values[0].strip())
        except ValueError:
            return _UNVERIFIED_CLOUDFLARE_CLIENT
        # IPv6 이용자는 보통 /64 대역을 통째로 받아 그 안에서 주소를 바꿔 보낼 수 있으므로 대역 단위로 센다.
        if isinstance(ip, IPv6Address):
            return str(ip_network(f"{ip}/64", strict=False))
        return str(ip)

    # 로컬 개발에서는 신뢰 프록시 헤더를 켜지 않고 실제 소켓 상대 주소를 사용한다.
    return request.client.host if request.client else "unknown"


@router.post("", status_code=201, response_model=InquiryCreated)
def create_inquiry(
    body: InquiryCreate,
    request: Request,
    background_tasks: BackgroundTasks,
):
    # 숨긴 입력칸이 채워졌으면 봇으로 보고 저장하지 않는다. 성공처럼 응답해야 봇이 다른 방법을 찾지 않는다.
    if body.website:
        return InquiryCreated()

    if not inquiry_limiter.allow(_client_key(request)):
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
