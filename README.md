# where-you-at

2026 관광데이터 활용 공모전 - [어디까지 왔니]

인구감소지역의 걷기·자전거 코스를 찾고, 따라가고, 그 지역에서 받을 수 있는
여행 지원금까지 확인하는 서비스입니다.

## 구성

| 위치 | 스택 | 역할 |
|---|---|---|
| `frontend/` | React 19, Vite, Tailwind v4, react-router | 사용자 화면 |
| `backend/` | FastAPI, psycopg2 | REST API, 외부 API 수집 스크립트 |
| Supabase | PostgreSQL | 데이터 저장 (클라우드) |

지도는 카카오 지도 SDK, 코스·관광 데이터는 두루누비와 한국관광공사 TourAPI에서 받아옵니다.

## 시작하기

### 1. 환경변수

각 폴더의 `.env.example`을 `.env`로 복사한 뒤 값을 채웁니다. 필요한 키와 발급처는
예시 파일 주석에 적어 뒀습니다.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

`.env`는 커밋되지 않습니다. 키를 새로 추가할 때는 `.env.example`에도 함께 넣어 주세요.
그러지 않으면 다른 사람 환경에서 조용히 동작이 빠집니다.

### 2. 백엔드

```bash
cd backend
python -m venv .venv
```

```bash
# macOS / Linux
source .venv/bin/activate

# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1
```

> Windows에서 `Activate.ps1`이 "스크립트를 실행할 수 없으므로"라는 오류로 막히면,
> PowerShell 실행 정책이 기본값(`Restricted`)이라 그렇습니다. 한 번만 풀어 주면 됩니다.
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

```bash
pip install -r requirements.txt
```

```bash
uvicorn app.main:app --reload
```

`http://localhost:8000/docs` 에서 API 문서를 볼 수 있습니다.

### 3. 프론트엔드

```bash
npm install --prefix frontend
```

```bash
npm run dev --prefix frontend
```

`http://localhost:5173` 에서 열립니다. 백엔드가 떠 있어야 데이터가 나옵니다.

## 데이터베이스

스키마와 초기 데이터는 `backend/sql/`에 있고, 번호 순서대로 적용합니다.

```
01_schema.sql             테이블 정의
02_region_seed.sql        지역 코드
03_support_seed.sql       지원금 제도
04_help_seed.sql          공지사항·자주 묻는 질문 (python -m scripts.seed_help)
05_inquiry_retention.sql  1:1 문의 자동 파기 예약 작업 (Supabase SQL Editor에서 실행)
```

외부 API에서 데이터를 받아오는 스크립트는 `backend/scripts/`에 있습니다.
`backend` 폴더에서 모듈로 실행해야 합니다. 파일 경로로 직접 실행하면
`backend/scripts`가 import 경로에 잡혀 `No module named 'app'` 오류가 납니다.

```bash
python -m scripts.seed_support
```

## 테스트

```bash
npm run test --prefix frontend
```

```bash
python -m unittest discover -s tests -t .
```

백엔드 테스트는 `unittest` 기반이라 별도 의존성 없이 돌아갑니다. `backend` 폴더에서
실행해야 `app` 패키지를 찾습니다.

## 상태 확인

| 경로 | 용도 |
|---|---|
| `GET /health` | 프로세스가 살아있는지 (liveness) |
| `GET /health/ready` | DB까지 붙어 요청을 받을 수 있는지 (readiness) |

배포 환경에서 로드밸런서는 `/health/ready`를 보게 설정합니다. `/health`는 DB 상태를
보지 않는데, 여기에 DB 확인을 넣으면 DB가 잠깐 끊겼을 때 서버 재시작만 반복하게 됩니다.

## 배포

개인정보처리방침(`frontend/src/features/help/PrivacyPolicyContent.tsx`)이 아래 배포 환경을 그대로 적고 있습니다.
업체·리전·요금제를 바꾸면 방침도 함께 고칩니다.

| 대상 | 업체 | 설정 |
|---|---|---|
| 웹사이트 | Vercel (Hobby) | `VITE_API_BASE_URL`에 API 서버의 `https://` 주소 |
| API 서버 | Render (Hobby, **Singapore** 리전) | `backend/.env.example`의 값, 새 문의 알림을 쓰면 `INQUIRY_WEBHOOK_URL` |
| DB | Supabase (Free, 서울 리전) | 문의 자동 파기 예약 작업 등록 (아래) |

### 문의 자동 파기 예약 작업

`backend/sql/05_inquiry_retention.sql` 전체를 Supabase SQL Editor에서 `postgres` 역할로 실행합니다.
다른 역할로 등록하면 RLS 때문에 한 건도 지우지 못합니다. 다시 실행해도 작업이 중복되지 않습니다.

실행 뒤 파일 끝의 확인 쿼리로 아래를 확인하고, 결과를 PR에 남깁니다.

- `cron.job`에 `delete-expired-inquiries`가 정확히 1개, `active = true`, `username`·`database`가 `postgres`, `schedule`·`command`가 파일과 같음
- 트리거 정의에 `BEFORE INSERT OR UPDATE OF status`가 들어 있음
- `status = '완료'`인데 `resolved_at`이 빈 문의가 0건
- 다음 날 한국 시간 03:00 이후 `cron.job_run_details`의 첫 실행이 `succeeded`

### 문의 요청 제한의 이용자 IP 확인

문의 API는 같은 IP에서 10분에 3건까지만 받습니다. Render 프록시 뒤에서는 `request.client.host`가
프록시 IP가 되어, 설정하지 않으면 **모든 이용자가 한 묶음으로 제한**됩니다.

Render 환경변수에 `FORWARDED_ALLOW_IPS=*`를 두면 uvicorn이 `X-Forwarded-For`의 맨 왼쪽 값을 IP로 씁니다.
그런데 맨 왼쪽은 이용자가 직접 넣어 보낼 수 있는 자리라, Render가 그 값을 덮어쓰는지 배포 후 확인한 뒤 확정합니다.
확정한 값은 Render 대시보드의 환경변수에 저장해 두고, 이 문서에도 결과를 적습니다.

`*`로 모든 프록시를 믿는 설정은 **Render 프록시가 API 서버의 유일한 진입점**이라는 전제에서만 안전합니다.
서버에 직접 접근할 수 있는 경로(다른 도메인, 공개 IP 등)를 열면 누구나 헤더를 조작할 수 있으니 이 설정을 다시 검토합니다.

코드를 고쳐 배포하지 않고, uvicorn 접속 로그와 실제 요청 결과로 확인합니다.
uvicorn은 프록시 헤더를 반영한 **뒤의** 주소를 접속 로그에 남기므로, 로그에 찍힌 IP가 곧 요청 제한에 쓰는 IP입니다.

1. Render 환경변수에 `FORWARDED_ALLOW_IPS=*`를 넣고 배포합니다. 시작 명령에 `--no-access-log`가 있으면 접속 로그가 남지 않으니 빼 둡니다.
2. 위조한 헤더로 요청합니다. `website`를 채워 보내므로 저장되지 않고, 요청 횟수에도 들어가지 않습니다.

   ```bash
   curl -X POST https://<API주소>/api/inquiries -H "Content-Type: application/json" -H "X-Forwarded-For: 1.2.3.4" -d '{"category":"기타","email":"a@b.co","content":"요청 제한 헤더 위조 확인용입니다","agreed":true,"website":"x"}'
   ```

3. Render 대시보드의 Logs에서 이 요청의 접속 로그(`<IP>:<포트> - "POST /api/inquiries HTTP/1.1" 201`)를 찾습니다.
   - 내 실제 IP가 찍히면(`1.2.3.4`가 아니면): 4번으로 갑니다.
   - `1.2.3.4`가 찍히면: 헤더를 조작해 제한을 피할 수 있다는 한계를 주석에 남기고, 오른쪽 끝에서 정해진 칸 수만큼
     떨어진 값을 쓰는 방식으로 따로 고칩니다.
4. 서로 다른 두 네트워크(예: 집 Wi-Fi와 휴대폰 데이터)에서 제한이 따로 걸리는지 확인합니다.
   실제로 저장되는 요청이라 문의 내용 앞에 `[배포 확인용]`을 붙입니다.
   - 네트워크 A에서 웹사이트의 1:1 문의로 4번 보냅니다. 3번은 접수되고, 4번째는 "잠시 후 다시 보내 주세요"가 나와야 합니다.
   - 곧바로(10분 안에) 네트워크 B에서 1번 보냅니다. 접수돼야 합니다. 여기서도 막히면 모든 이용자가 한 묶음으로 제한되는 상태입니다.
   - 끝나면 Supabase 테이블 편집기에서 `[배포 확인용]` 문의를 지웁니다.
5. 3번에 찍힌 IP가 실제 IP였는지와 4번 결과를 PR에 남기고, 위의 "배포 후 확인한 뒤 확정합니다"를 확정 결과로 바꿉니다.
