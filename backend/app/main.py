from contextlib import asynccontextmanager

from anyio import CapacityLimiter
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from .api.router import api_router
from .db.supabase import get_db_connection
from .services import kakao_oauth


@asynccontextmanager
async def lifespan(app: FastAPI):
    """카카오 로그인 연결과 동시 실행 제한을 애플리케이션 수명에 맞춰 관리한다."""
    async with kakao_oauth.create_login_client() as client:
        app.state.kakao_login_http = client
        app.state.kakao_login_limiter = CapacityLimiter(kakao_oauth.LOGIN_CONCURRENCY_LIMIT)
        yield


app = FastAPI(title="어디까지왔니 API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# '가까운 순'을 브라우저에서 정렬하려고 목록 전체를 받는 경우(코스 약 870KB, 자전거 실시간 약 1.7MB)가 있어 압축한다.
# JSON은 4분의 1 이하로 줄어든다. 1KB 미만 응답은 압축 이득보다 비용이 커서 그대로 보낸다.
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(api_router)

@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc: RequestValidationError):
    """422 응답 본문을 직접 만든다.

    FastAPI 기본 핸들러는 오류에 원본 입력값(input)을 담는데, inf/nan이 들어오면
    JSON으로 직렬화하지 못해 422가 아니라 500이 난다. 입력값과 ctx를 빼서 막는다.
    """
    errors = [{k: v for k, v in err.items() if k not in ("input", "ctx")} for err in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})


@app.get("/health")
async def health():
    """살아있음(liveness) 확인 — 프로세스가 응답할 수 있는지만 본다.

    여기서 DB까지 확인하면 안 된다. 이 응답이 실패할 때 프로세스를 재시작하는 게
    보통의 설정인데, DB가 잠깐 끊겼다고 서버를 재시작해봐야 나아지는 게 없고
    재시작만 반복하게 된다. DB 상태는 아래 /health/ready에서 본다.

    async인 이유: sync def로 두면 FastAPI가 스레드풀(anyio 기본 40)에서 돌린다.
    DB가 느려져 슬롯이 다 차면 이 응답까지 스케줄되지 못해, 프로세스는 멀쩡한데
    liveness가 실패한다. 블로킹 없이 즉시 반환하므로 이벤트 루프에서 처리한다.
    """
    return {"status": "ok"}


@app.get("/health/ready")
def readiness():
    """받을 준비됨(readiness) 확인 — 실제로 요청을 처리할 수 있는지 본다.

    거의 모든 엔드포인트가 DB를 쓰므로, DB에 못 붙는 인스턴스는 트래픽을 받으면 안 된다.
    로드밸런서가 이 경로를 보게 해두면 그런 인스턴스를 알아서 빼준다.
    """
    conn = get_db_connection()
    if conn is None:
        return JSONResponse(status_code=503, content={"status": "error", "database": "down"})

    try:
        # SELECT 1은 연결이 살아있는지만 확인한다. 연결 객체가 있어도 세션이 끊겨 있을 수 있다.
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return {"status": "ok", "database": "up"}
    except Exception as e:
        # conn is None 경로는 get_db_connection이 원인을 찍어주지만, 이쪽은 아무것도
        # 남지 않는다. SELECT 1을 넣은 이유인 "연결 객체는 있는데 세션이 끊긴" 경우가
        # 정작 통째로 묻히므로 여기서 남긴다.
        print(f"[ERROR] DB 세션 확인 실패: {e}")
        return JSONResponse(status_code=503, content={"status": "error", "database": "down"})
    finally:
        conn.close()
