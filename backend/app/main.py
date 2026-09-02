from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.router import api_router
from .db.supabase import get_db_connection

app = FastAPI(title="어디까지왔니 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
def health():
    """살아있음(liveness) 확인 — 프로세스가 응답할 수 있는지만 본다.

    여기서 DB까지 확인하면 안 된다. 이 응답이 실패할 때 프로세스를 재시작하는 게
    보통의 설정인데, DB가 잠깐 끊겼다고 서버를 재시작해봐야 나아지는 게 없고
    재시작만 반복하게 된다. DB 상태는 아래 /health/ready에서 본다.
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
    except Exception:
        return JSONResponse(status_code=503, content={"status": "error", "database": "down"})
    finally:
        conn.close()
