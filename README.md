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
.venv\Scripts\activate
```

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
01_schema.sql        테이블 정의
02_region_seed.sql   지역 코드
03_support_seed.sql  지원금 제도
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
