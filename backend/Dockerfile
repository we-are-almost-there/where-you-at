# API 서버 이미지. 빌드 컨텍스트는 backend/ 이다.
#   docker build -t where-you-at-api backend
#
# 같은 이미지로 일회성 작업(python -m scripts.seed_help 등)도 실행할 수 있게 scripts/와 sql/을 함께 넣는다.
# 결과 파일을 backend 아래에 쓰는 수집·보정 스크립트는 /app에 쓸 수 없어 로컬에서 실행한다(README "Docker로 실행").
# 비밀값은 이미지에 넣지 않고 실행 환경의 환경변수로 받는다(.dockerignore가 .env를 뺀다).

# CI(.github/workflows/ci.yml)와 같은 Python 3.14. 태그가 가리키는 이미지가 바뀌지 않게 digest로 고정한다.
FROM python:3.14-slim@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f

# 로그를 버퍼 없이 바로 내보내 컨테이너 로그(CloudWatch 등)에 즉시 남게 하고, .pyc 파일은 만들지 않는다.
# 자전거 수집 작업의 파일 로그도 끈다. 컨테이너는 표준 출력 로그만 쓴다. .env가 다시 켜도 /app/logs를 만들 수
# 없으면 스크립트가 표준 출력 로그로 물러난다.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    BICYCLE_FILE_LOG_ENABLED=false

WORKDIR /app

# 의존성 층을 소스보다 먼저 만들어, 코드만 바뀌면 설치를 다시 하지 않는다.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY scripts ./scripts
COPY sql ./sql

# root가 아닌 사용자로 실행한다. 소스는 root 소유로 두어 실행 중에 고칠 수 없다.
RUN useradd --system --no-create-home --uid 10001 app
USER app

EXPOSE 8000

# Render 시작 명령과 같은 조건이다(README "요청 제한의 이용자 IP 확인").
# --workers 1: 요청 제한이 프로세스 메모리 기반이라 여러 개면 각자 따로 센다.
# --no-proxy-headers: 이용자 IP는 uvicorn이 아니라 앱이 설정(TRUST_CLOUDFLARE_IP_HEADER 또는
#   TRUSTED_PROXY_HOPS)에 따라 직접 확인한다.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-proxy-headers"]
