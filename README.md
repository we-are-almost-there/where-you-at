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
| API 서버 | Render (Hobby, **Singapore** 리전) | `backend/.env.example`의 값, `TRUST_CLOUDFLARE_IP_HEADER=true` (아래 확인 절차) |
| DB | Supabase (Free, 서울 리전) | 문의 자동 파기 예약 작업 등록 (아래) |

### 문의 자동 파기 예약 작업

`backend/sql/05_inquiry_retention.sql` 전체를 Supabase SQL Editor에서 `postgres` 역할로 실행합니다.
다른 역할로 등록하면 RLS 때문에 한 건도 지우지 못합니다. 다시 실행해도 작업이 중복되지 않습니다.

실행 뒤 파일 끝의 확인 쿼리로 아래를 확인하고, 결과를 PR에 남깁니다.

- `cron.job`에 `delete-expired-inquiries`가 정확히 1개, `active = true`, `username`·`database`가 `postgres`, `schedule`·`command`가 파일과 같음
- 트리거 정의에 `BEFORE INSERT OR UPDATE OF status`가 들어 있음
- `status = '완료'`인데 `resolved_at`이 빈 문의가 0건
- 다음 날 한국 시간 03:00 이후 `cron.job_run_details`의 첫 실행이 `succeeded`

### 새 문의 알림

새 문의가 저장되면 운영팀 전용 비공개 Slack 채널에 `[어디까지왔니] 새 1:1 문의가 있어요`라는 제목과 함께 문의 유형,
답변받을 이메일, 문의 내용 전체를 보냅니다. 문의 번호와 접수 시각은 따로 보내지 않습니다. 알림에서 문의를 확인하고
이메일로 답변할 수 있으며, 처리 상태를 바꿀 때만 Supabase 테이블 편집기의 `inquiry` 테이블을 엽니다.
알림 전송이 실패하거나 `INQUIRY_WEBHOOK_URL`이 비어 있어도 문의 저장은 정상 처리됩니다.

배포할 때 다음 순서로 설정합니다.

1. Slack 수탁과 국외 이전을 안내하는 개인정보처리방침 7·8번을 먼저 배포합니다.
2. 운영팀원 3명만 참여하는 비공개 채널을 만들고, Slack 메시지 보존 기간을 90일로 설정합니다.
3. 그 채널의 Incoming Webhook을 만들고 URL을 Render의 비밀 환경변수 `INQUIRY_WEBHOOK_URL`에 등록한 뒤 재배포합니다.
   URL은 코드, `.env`, PR, 채팅에 붙이지 않습니다.
4. 웹사이트에서 배포 확인용 문의를 한 건 보냅니다. Supabase에 문의가 저장되고 Slack에는 제목과 입력한 문의 정보만
   오는지 확인합니다.
5. 알림을 확인한 운영자는 Supabase에서 문의를 `처리중`으로 바꾸고, 답장을 보내면 `완료`로 바꿉니다.

Slack 알림과 별개로 확인 당번은 **매주 월요일·목요일** 아래 두 곳을 확인합니다. 이는 알림 누락을 발견하고 개인정보 관련
권리 행사 요청의 회신 기한을 지키기 위한 안전 점검입니다.

- Supabase의 `inquiry` 테이블에서 `status`가 `완료`가 아닌 문의(`접수`·`처리중`)
- 개인정보 보호책임자 이메일로 온 권리 행사 요청. 방침 11번은 이메일로도 요청을 받습니다(보호책임자 본인 또는 당번).

규칙은 다음과 같습니다.

- 개인정보처리방침 11번은 권리 행사(열람·삭제 등) 요청에 10일 이내 회신을 약속합니다. 확인한 요청은 늦어도 다음 확인일 전까지 답장합니다.
- 삭제·동의 철회 요청을 받으면 입력된 이메일만 같다는 이유로 바로 삭제하지 않습니다. 기존 문의에 저장된 이메일 주소로
  확인 메일을 보내고, 회신을 받아 해당 이메일을 사용하는 사람임을 확인합니다.
- 확인이 끝나면 요청 범위에 해당하는 Slack 알림을 이메일로 검색해 직접 삭제한 뒤 Supabase `inquiry` 테이블에서 해당
  문의를 삭제합니다. 1:1 문의로 권리 행사를 요청했다면 원래 문의 알림과 권리 행사 요청 알림을 모두 삭제합니다.
- 14세 미만 아동이 보낸 문의임을 알게 된 경우에도 같은 방법으로 Slack 알림과 데이터베이스의 문의를 지체 없이 삭제합니다.
- 삭제를 마치면 요청자에게 처리 결과를 회신합니다. Slack 메시지는 운영팀 전용 비공개 채널의 메뉴에서 직접 삭제할 수
  있음을 실제 채널에서 확인했습니다.
- 확인일이 휴일이거나 당번이 없으면 전날이나 다음 날 확인합니다. 한 번 건너뛰면 확인 간격이 7일로 늘어 10일을 넘길 수 있습니다.
- 답장을 보내면 `status`를 `완료`로 바꿉니다. `완료`여야 보유 기간(처리 완료 후 1년)이 지난 뒤 자동 파기됩니다.
- 당번은 PR 설명과 팀 채널에 적어 둡니다.

### 문의 요청 제한의 이용자 IP 확인

문의 API는 같은 IP에서 10분에 3건까지만 받습니다. Render 앞단의 Cloudflare는 실제 접속 IP 한 개를
`CF-Connecting-IP`에 넣습니다. 반면 `X-Forwarded-For`는 이용자가 미리 넣은 값을 보존할 수 있고 실제 배포 확인에서도
위조값 `1.2.3.4`가 uvicorn에 적용됐으므로 요청 제한에는 사용하지 않습니다.

애플리케이션은 Render에서만 `CF-Connecting-IP`를 IP 주소로 검증해 사용합니다. IPv6는 이용자가 받은 /64 대역 안에서
주소를 바꿔 제한을 피할 수 있어 /64 단위로 셉니다. 헤더가 없거나 단일 IPv4/IPv6가 아니면
소켓 주소로 물러나지 않고 모두 하나의 `unverified-cloudflare-client` 그룹으로 묶습니다. 헤더 누락·변조가 제한 우회로
이어지는 것보다 일부 요청이 함께 제한되는 쪽으로 안전하게 실패하기 위해서입니다.

1. Render 대시보드 환경변수에 `TRUST_CLOUDFLARE_IP_HEADER=true`를 등록합니다.
   `FORWARDED_ALLOW_IPS`는 삭제하고 시작 명령은 아래처럼 프록시 헤더 처리를 끕니다. `--workers 1`도 유지해야 합니다.

   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --no-proxy-headers
   ```

2. 배포한 뒤 네트워크 A의 공인 IP를 `https://api.ipify.org`에서 확인합니다. 공개 저장소라 IP 값은 PR에 적지 않습니다.
   같은 네트워크에서 `X-Forwarded-For` 값만 매번 바꿔 실제 문의를 4번 보냅니다.
   `CF-Connecting-IP`를 클라이언트에서 직접 보내면 Cloudflare가 Error 1000으로 차단하므로 테스트 요청에 넣지 않습니다.
   Cloudflare가 자체적으로 추가한 `CF-Connecting-IP`가 네 요청에서 같고 애플리케이션이 `X-Forwarded-For`를 무시하면
   처음 3번은 접수되고 4번째는 `429`와 함께 "잠시 후 다시 보내 주세요"가 나와야 합니다.
   문의 내용 앞에는 `[배포 확인용]`을 붙입니다.
3. 곧바로(10분 안에) 다른 네트워크(예: 휴대폰 데이터)로 전환하고 공인 IP를 다시 확인합니다.
   네트워크 A와 다른 값인 것을 확인한 뒤 헤더를 직접 넣지 않은 실제 문의를 한 번 보냅니다. 이 요청은 접수돼야 합니다.
   공인 IP가 다른데도 여기서 막히면 이용자 IP를 구분하지 못하는 상태이므로 배포를 확정하지 않습니다.
4. Supabase의 `[배포 확인용]` 문의와 해당 Slack 알림을 삭제하고, 두 네트워크의 확인 결과를 PR에 남깁니다.
   IP 값 대신 "두 네트워크의 공인 IP가 달랐음"과 요청별 응답 코드만 적습니다.

이 신뢰 설정은 Render 공개 서비스가 Cloudflare를 우회해 직접 접근될 수 없다는 전제에서만 사용합니다. 호스팅 업체나
진입 경로를 바꾸면 `TRUST_CLOUDFLARE_IP_HEADER`를 먼저 `false`로 내리고 새 프록시의 보장된 헤더를 다시 검토합니다.
