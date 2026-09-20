import hmac
import json
from datetime import datetime, timezone
from urllib.parse import parse_qsl
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from ...core.config import settings
from ...crud import user as user_crud
from ...deps import CurrentUser, db_connection, get_current_user
from ...schemas.user import KakaoLoginRequest, LoginResponse, UserOut
from ...services import auth_token, kakao_oauth, slack_notify
from ...services.rate_limit import SlidingWindowLimiter, client_key

router = APIRouter(prefix="/api/auth", tags=["auth"])

# 같은 IP에서 10분에 20회까지. 한 번의 로그인은 한 번 호출하므로 공용 IP(학교, 회사, 모바일 캐리어 NAT)
# 뒤에 여러 사람이 있어도 걸리지 않고, 단일 IP가 한 번에 몰아 보낼 수 있는 양을 동기 라우터가 함께 쓰는
# 스레드풀(기본 40)보다 작게 둔다. 동시 실행 수 자체는 제한하지 않는다(#150 후속).
# 메모리 기반이라 서버 재시작 시 초기화된다 (services/rate_limit.py 참고).
login_limiter = SlidingWindowLimiter(max_requests=20, window_seconds=600)

# 요청을 막는 용도가 아니라 아래 로그를 10분에 한 번만 남기는 용도다. 헤더 설정이나 프록시 경로가
# 깨지면 로그인 요청마다 같은 줄이 쌓여 다른 로그를 덮는다.
unverified_log_limiter = SlidingWindowLimiter(max_requests=1, window_seconds=600)

_ADMIN_KEY_PREFIX = "KakaoAK "


@router.post("/kakao", response_model=LoginResponse)
def login_with_kakao(body: KakaoLoginRequest, request: Request):
    """카카오 인가 코드로 로그인한다. 처음 로그인하면 회원을 만든다."""
    if not (kakao_oauth.is_configured() and auth_token.is_configured()):
        print("[ERROR] 카카오 로그인 설정이 비어 있거나 JWT_SECRET이 32바이트보다 짧습니다.")
        raise HTTPException(status_code=503, detail="지금은 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.")

    # 카카오 토큰 교환 전에 한도를 확인해, 한도를 넘은 반복 요청이 외부 호출로 이어지지 않게 한다.
    key = client_key(request)
    if key is None:
        # 이용자 IP를 확인하지 못한 요청은 제한하지 않는다(fail open). 문의와 달리 한 키로 묶으면
        # 헤더 검증이 깨진 동안 전체 이용자가 로그인하지 못한다. 설정이 깨진 신호이므로 로그를 남긴다.
        # 요청마다 같은 줄이 쌓이지 않게 10분에 한 번만 남긴다.
        if unverified_log_limiter.allow("login-unverified-client"):
            print("[ERROR] 로그인 요청 제한을 건너뜁니다: 이용자 IP를 확인하지 못했습니다(CF-Connecting-IP 확인 필요).")
    elif not login_limiter.allow(key):
        raise HTTPException(status_code=429, detail="로그인을 너무 자주 시도했어요. 잠시 후 다시 시도해 주세요.")

    try:
        kakao_token = kakao_oauth.exchange_code(body.code)
        kakao_user = kakao_oauth.fetch_user(kakao_token)
    except kakao_oauth.KakaoAuthError:
        raise HTTPException(status_code=401, detail="로그인 요청이 만료되었습니다. 다시 로그인해 주세요.")
    except kakao_oauth.KakaoUpstreamError as e:
        print(f"[ERROR] 카카오 로그인 실패: {e}")
        raise HTTPException(status_code=502, detail="카카오 로그인을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.")

    # 카카오 확인이 끝난 요청만 DB에 연결한다(inquiries.py와 같은 이유).
    now = datetime.now(timezone.utc)
    session_id = uuid4()
    with db_connection() as conn:
        user = user_crud.upsert_kakao_user(conn, kakao_id=kakao_user.kakao_id, nickname=kakao_user.nickname)
        user_crud.create_session(
            conn,
            user_id=user["id"],
            session_id=session_id,
            expires_at=now + auth_token.ACCESS_TOKEN_TTL,
        )
    return LoginResponse(
        access_token=auth_token.create_access_token(user["id"], session_id, now=now),
        user=UserOut(**user),
    )


@router.post("/logout", status_code=204)
def logout(current_user: CurrentUser = Depends(get_current_user)):
    """현재 요청에 사용한 로그인 세션만 삭제한다."""
    with db_connection() as conn:
        user_crud.delete_session(conn, user_id=current_user.id, session_id=current_user.session_id)


# 카카오 콘솔에 등록하는 주소라 공개 문서(/docs)에는 싣지 않는다.
@router.api_route("/kakao/unlink", methods=["GET", "POST"], include_in_schema=False)
async def kakao_unlink_callback(request: Request, background_tasks: BackgroundTasks):
    """사용자가 카카오 쪽에서 직접 연결을 끊었을 때 회원 행을 지운다(연결 해제 웹훅).

    우리가 탈퇴 API에서 연결 해제를 호출한 경우에는 이 웹훅이 오지 않는다. 카카오 계정관리나
    카카오톡의 연결된 앱 관리에서 사용자가 직접 끊었을 때만 온다.

    카카오는 3초 안에 200을 기대하고, 재전송은 계정 상태 변경 웹훅에서만 지원해 연결 해제 웹훅은
    다시 보내지 않는다. 그래서 회원을 못 찾거나 삭제가 실패해도 200을 돌려주고, 놓친 삭제는
    Slack 알림과 [ERROR] 로그로 찾아 직접 지운다(README 참고).
    200이 아닌 응답은 검증에 실패한 요청(401)에만 쓴다. 이때의 401은 카카오가 아닌 요청이거나
    우리가 가진 키가 대표 어드민 키가 아니라는 신호다.

    삭제를 백그라운드로 넘기는 이유: DB의 connect_timeout이 3초라 연결이 느려지면 응답이 그대로
    3초를 넘긴다. 오류가 잦으면 카카오가 웹훅을 비활성화할 수 있고, 한 번 꺼지면 이후 웹훅이 모두
    오지 않는다. 재전송이 없어 응답을 기다린다고 삭제 결과가 나아지지도 않는다.

    async인 이유: 카카오가 보내는 형식이 문서에 없어 쿼리와 바디를 모두 봐야 하고, 바디를 읽으려면
    await이 필요하다.
    """
    if not _is_kakao_admin_request(request.headers.get("authorization")):
        # 우리 키가 대표 어드민 키가 아니면 모든 웹훅이 여기서 버려진다. 카카오 콘솔을 열지 않아도
        # 알아차릴 수 있도록 남긴다. 받은 키는 남기지 않는다.
        print("[ERROR] 연결 끊기 웹훅 인증 실패: 카카오가 아닌 요청이거나 KAKAO_LOGIN_ADMIN_KEY가 대표 어드민 키가 아닙니다.")
        raise HTTPException(status_code=401, detail="인증되지 않은 요청입니다.")

    params = _callback_params(request, await request.body())
    try:
        kakao_id = int(params["user_id"])
    except (KeyError, ValueError):
        # 다시 보내도 같은 결과라 200으로 끝내고, 규격이 바뀐 신호이므로 받은 항목 이름만 남긴다.
        # 규격이 바뀌면 모든 웹훅이 이 경로로 빠지므로 삭제 실패와 같은 알림을 보낸다.
        # Slack 전송도 3초까지 기다리므로 응답 뒤로 넘긴다.
        print(f"[ERROR] 연결 끊기 웹훅에 회원번호가 없습니다: params={sorted(params)}")
        background_tasks.add_task(slack_notify.notify_unlink_failure)
        return {"received": True}

    background_tasks.add_task(_delete_user_by_kakao_id, kakao_id)
    return {"received": True}


def _is_kakao_admin_request(authorization: str | None) -> bool:
    """카카오가 대표 어드민 키로 보낸 요청인지 확인한다. 키는 로그에 남기지 않는다."""
    admin_key = settings.kakao_login_admin_key
    if not admin_key or authorization is None or not authorization.startswith(_ADMIN_KEY_PREFIX):
        return False
    # bytes로 비교한다. str끼리 비교하면 비ASCII 헤더에서 TypeError가 나 401 대신 500이 나간다.
    sent = authorization[len(_ADMIN_KEY_PREFIX) :].strip()
    return hmac.compare_digest(sent.encode("utf-8"), admin_key.encode("utf-8"))


def _callback_params(request: Request, body: bytes) -> dict[str, str]:
    """카카오가 GET(쿼리)이나 POST(폼, JSON) 중 무엇으로 보내도 파라미터를 꺼낸다.

    문서에 Content-Type이 없어 세 형태를 모두 받는다. Starlette의 request.form()은
    urlencoded에도 python-multipart 의존성을 요구하므로 바디를 직접 파싱한다.

    쿼리와 바디를 합치고 겹치는 키는 바디를 우선한다. 한쪽만 보면 콘솔에 쿼리가 붙은 주소를
    등록하는 실수 한 번으로 모든 웹훅의 바디가 조용히 버려진다.
    """
    return {**request.query_params, **_body_params(request, body)}


def _body_params(request: Request, body: bytes) -> dict[str, str]:
    if request.headers.get("content-type", "").startswith("application/json"):
        try:
            parsed = json.loads(body or b"{}")
        except ValueError:
            return {}
        return {key: str(value) for key, value in parsed.items()} if isinstance(parsed, dict) else {}
    return dict(parse_qsl(body.decode("utf-8", "replace")))


def _delete_user_by_kakao_id(kakao_id: int) -> None:
    """회원 행을 지운다. 카카오에 200을 돌려줘야 하므로 실패해도 예외를 올리지 않고 로그만 남긴다.

    탈퇴 API와 같은 delete_user를 쓴다. 회원에 딸린 정리가 늘어날 때 한쪽에만 들어가지 않게 한다.
    """
    try:
        with db_connection() as conn:
            user_id = user_crud.get_user_id_by_kakao_id(conn, kakao_id)
            if user_id is None:
                return
            user_crud.delete_user(conn, user_id)
    except Exception as e:
        # DB 연결 실패(503)까지 여기서 삼킨다. 로그의 회원번호로 직접 지워야 한다.
        print(f"[ERROR] 연결 끊기 웹훅 회원 삭제 실패(직접 삭제 필요): kakao_id={kakao_id} {type(e).__name__}")
        # 로그만으로는 7일 안에 아무도 보지 않으면 놓친다. 알림 전송이 실패해도 로그는 이미 남았다.
        slack_notify.notify_unlink_failure()
