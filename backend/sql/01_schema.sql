-- ============================================
-- 어디까지왔니 — 지원금/환급 테이블
-- ============================================


-- 1. region (지역) — 공동 사용
create table region (
  id                 bigint generated always as identity primary key,
  region_code        varchar(10) not null unique,
  name               text not null,
  sido               text not null,
  is_population_drop boolean not null default false
);


-- 2. support (지원 제도)
create table support (
  id              bigint generated always as identity primary key,
  support_title   text not null,
  agency          text,
  summary         text,
  description     text,
  support_type    varchar(50) not null,
  refund_type     varchar(50) not null,
  max_amount      integer,
  is_pre_approval boolean not null default false,
  apply_url       text,
  start_date      date,
  end_date        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);


-- 3. support_region (지원제도 ↔ 지역, M:N 복합 PK)
create table support_region (
  support_id bigint not null references support(id) on delete cascade,
  region_id  bigint not null references region(id)  on delete cascade,
  primary key (support_id, region_id)
);


-- 4. refund_rule (환급 규칙)
create table refund_rule (
  id           bigint generated always as identity primary key,
  support_id   bigint not null references support(id) on delete cascade,
  category     varchar(50) not null,
  min_spend    integer,
  min_nights   integer,
  max_nights   integer,
  cap_at_spend boolean not null default true,
  refund_value integer not null,
  is_rate      boolean not null default false,
  description  text,
  override_region_id bigint references region(id) on delete cascade,    -- 이 지역에 해당되는 경우에만 기본 규칙을 덮어씀
  constraint chk_nights check (min_nights is null or max_nights is null or min_nights <= max_nights)
);


-- 5. checklist_item (준비물 체크리스트)
create table checklist_item (
  id           bigint generated always as identity primary key,
  support_id   bigint not null references support(id) on delete cascade,
  content      text not null,
  is_essential boolean not null default true,
  sort_order   integer not null default 0
);


-- 6. support_schedule (지역·차수별 신청 일정)
create table support_schedule (
  id           bigint generated always as identity primary key,
  support_id   bigint not null,
  region_id    bigint not null,
  apply_round  integer,
  apply_start  timestamptz,
  apply_end    timestamptz,
  travel_start date,
  travel_end   date,
  status       varchar(10) not null,
  created_at   timestamptz not null default now(),
  apply_url    text,
  foreign key (support_id, region_id)
    references support_region (support_id, region_id)
    on delete cascade,
  unique nulls not distinct (support_id, region_id, apply_round),
  check (apply_round is null or apply_round >= 1),
  check (status in ('준비중', '접수중', '마감'))
);

-- 인덱스 생성
create index idx_support_schedule_region on support_schedule (region_id);

-- 행 수준 보안(RLS)
-- Supabase Data API(anon·authenticated 키)로는 테이블을 읽거나 쓰지 못하게 막는다.
-- 정책(policy)은 일부러 만들지 않는다. 백엔드와 수집 스크립트는 postgres 역할(테이블 소유자)로
-- Postgres에 직접 접속해 RLS가 적용되지 않으므로 동작이 바뀌지 않는다.
-- force row level security는 쓰지 않는다. 소유자에게도 RLS가 걸려 백엔드 조회가 빈 결과가 된다.
-- 새 테이블을 추가하면 그 섹션의 이 목록에도 한 줄 추가한다.
alter table region           enable row level security;
alter table support          enable row level security;
alter table support_region   enable row level security;
alter table refund_rule      enable row level security;
alter table checklist_item   enable row level security;
alter table support_schedule enable row level security;


-- ============================================
-- 어디까지왔니 — 지도/코스 테이블 (지도/코스)
-- ============================================

-- 1. course (코스)
create table course (
  id               bigint generated always as identity primary key,
  source_id        text not null unique,
  course_title     varchar(255) not null,
  description      text,
  start_address    text,
  region_code      varchar(10),
  image_url        varchar(500),
  original_gpx_url varchar(500),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);


-- 2. course_waypoint (코스 경로 좌표)
create table course_waypoint (
  id               bigint generated always as identity primary key,
  course_id        bigint not null references course(id) on delete cascade,
  route_type       varchar(10) not null default 'trail',
  lat              double precision not null check (lat between -90 and 90),
  lng              double precision not null check (lng between -180 and 180),
  sequence_order   int not null,
  created_at       timestamptz not null default now(), 
  unique (course_id, route_type, sequence_order)
);


-- 3. course_route (경로별 거리·난이도·시작점·bounds)
create table course_route (
  id               bigint generated always as identity primary key,
  course_id        bigint not null references course(id) on delete cascade,
  route_type       varchar(10) not null,
  distance         numeric not null,
  estimated_time   int,
  difficulty       varchar(20),
  start_lat        double precision,
  start_lng        double precision,
  min_lat          double precision,
  max_lat          double precision,
  min_lng          double precision,
  max_lng          double precision,
  created_at       timestamptz not null default now(),
  unique (course_id, route_type),
  check (route_type in ('trail', 'bicycle'))
);

-- 행 수준 보안(RLS)
-- 이유와 주의사항은 지원금/환급 섹션 끝의 RLS 주석 참고. 새 테이블을 추가하면 여기에도 한 줄 추가한다.
alter table course          enable row level security;
alter table course_waypoint enable row level security;
alter table course_route    enable row level security;


-- ============================================
-- 어디까지왔니 — 주변정보/대회 테이블
-- ============================================


-- geom 자동 생성 함수 (map_x, map_y → geom)
-- 위경도 입력/수정 시 PostGIS 좌표를 자동으로 채워 동기화 오류 방지
create or replace function sync_geom_from_xy()
returns trigger as $$
begin
  if new.map_x is not null and new.map_y is not null then
    new.geom = ST_SetSRID(ST_MakePoint(new.map_x, new.map_y), 4326);
  end if;
  return new;
end;
$$ language plpgsql;


-- 1. tour_spot (관광지/문화시설/숙박/쇼핑/음식점 공통 부모)
create table tour_spot (
  content_id      varchar(20) primary key,
  content_type_id varchar(5) not null,
  tour_spot_title varchar(200) not null,
  addr1           text,
  addr2           text,
  map_x           double precision not null,
  map_y           double precision not null,
  geom            geometry(Point, 4326),
  first_image     text,
  region_code     varchar(10),
  created_at      timestamptz not null default now(),
  synced_at       timestamptz not null default now()
);

create trigger trg_tour_spot_geom
  before insert or update on tour_spot
  for each row execute function sync_geom_from_xy();

alter table tour_spot alter column geom set not null;

-- 인덱스 생성
create index idx_tour_spot_content_type on tour_spot (content_type_id);
create index idx_tour_spot_map_x on tour_spot (map_x);
create index idx_tour_spot_map_y on tour_spot (map_y);
create index idx_tour_spot_geom on tour_spot using gist (geom);
create index idx_tour_spot_region on tour_spot (region_code);


-- 2. attraction (관광지 상세) — tour_spot 자식
create table attraction (
  content_id  varchar(20) primary key references tour_spot(content_id) on delete cascade,
  info_center text,
  rest_date   text,
  use_time    text,
  parking     text,
  use_fee     text,
  sale_item   text
);


-- 3. accommodation (숙박 상세) — tour_spot 자식
create table accommodation (
  content_id      varchar(20) primary key references tour_spot(content_id) on delete cascade,
  checkin_time    text,
  checkout_time   text,
  parking         text,
  reservation_url text
);


-- 4. restaurant (음식점 상세) — tour_spot 자식
create table restaurant (
  content_id     varchar(20) primary key references tour_spot(content_id) on delete cascade,
  first_menu     text,
  treat_menu     text,
  open_time      text,
  rest_date      text
);


-- 5. bicycle_facility (자전거 시설) — 독립 테이블 (자체 좌표 보유)
create table bicycle_facility (
  bicycle_id         bigint generated always as identity primary key,
  source_id          varchar(50) not null unique,
  facility_title     varchar(200) not null,
  addr1              varchar(255),
  map_x              double precision not null,
  map_y              double precision not null,
  geom               geometry(Point, 4326),
  facility_type      varchar(20) not null,
  rental_fee_type    varchar(10),
  repair_available   boolean,
  open_hours         varchar(100),
  total_bikes        int,
  available_bikes    int,
  region_code        varchar(10),
  created_at         timestamptz not null default now(),
  synced_at          timestamptz not null default now(),
  realtime_synced_at timestamptz
);

create trigger trg_bicycle_facility_geom
  before insert or update on bicycle_facility
  for each row execute function sync_geom_from_xy();

alter table bicycle_facility alter column geom set not null;

-- 인덱스 생성
create index idx_bicycle_geom on bicycle_facility using gist (geom);
create index idx_bicycle_region on bicycle_facility (region_code);


-- 6. nearby_spot (기준 대상 주변 장소 캐시)
create table nearby_spot (
  id                bigint generated always as identity primary key,
  base_type         varchar(20) not null,   -- course / race
  base_id           varchar(50) not null,
  route_type        varchar(20) not null default 'trail',  -- trail / bicycle
  nearby_type       varchar(20) not null,   -- attraction/accommodation/restaurant/bicycle/race
  nearby_content_id varchar(50) not null,
  distance_km       double precision not null,
  cached_at         timestamptz not null default now(),
  expires_at        timestamptz not null,
  unique (base_type, base_id, nearby_type, nearby_content_id, route_type)
);

-- 인덱스 생성
create index idx_nearby_base on nearby_spot (base_type, base_id, route_type);
create index idx_nearby_type on nearby_spot (nearby_type);


-- 7. race (마라톤/자전거 대회)
create table race (
  event_id      bigint generated always as identity primary key,
  source        varchar(20) not null,
  source_id     varchar(50) not null,
  race_title    varchar(200) not null,
  event_type    varchar(20),
  start_date    date not null,
  end_date      date,
  location_name varchar(200),
  map_x         double precision,
  map_y         double precision,
  geom          geometry(Point, 4326),
  region_code   varchar(10),
  contact       varchar(100),
  homepage_url  varchar(255),
  created_at    timestamptz not null default now(),
  synced_at     timestamptz not null default now(),
  unique (source, source_id)
);

create trigger trg_race_geom
  before insert or update on race
  for each row execute function sync_geom_from_xy();

-- 인덱스 생성
create index idx_race_type on race (event_type);
create index idx_race_start on race (start_date);
create index idx_race_end on race (end_date);
create index idx_race_geom on race using gist (geom);
create index idx_race_region on race (region_code);

-- 행 수준 보안(RLS)
-- 이유와 주의사항은 지원금/환급 섹션 끝의 RLS 주석 참고. 새 테이블을 추가하면 여기에도 한 줄 추가한다.
alter table tour_spot        enable row level security;
alter table attraction       enable row level security;
alter table accommodation    enable row level security;
alter table restaurant       enable row level security;
alter table bicycle_facility enable row level security;
alter table nearby_spot      enable row level security;
alter table race             enable row level security;


-- ============================================
-- 어디까지왔니 — 고객지원 테이블
-- ============================================
-- 별도 관리자 화면이 없어 Supabase 테이블 편집기에서 행을 직접 넣고 고친다.
-- 본문(content, answer)은 제한된 마크다운이다. 문단(빈 줄), 목록(- , 하위 항목은 두 칸 들여쓰기 한 단계까지),
--   굵게(**), 링크([글자](주소))만 쓴다.
--   제목·표·이미지·HTML은 화면에서 그리지 않는다. 미리보기가 없는 콘솔에서 쓰므로 요소를 줄였다.
--   줄바꿈 한 번은 공백으로 이어지니, 줄을 나누려면 빈 줄을 넣어 문단을 나눈다.


-- updated_at 자동 갱신 함수
--   해당 섹션의 테이블은 코드가 아니라 콘솔에서 고치므로 수정 시각을 사람이 넣지 않는다.
--   default now()는 insert 때만 채워져서, 트리거가 없으면 행을 고쳐도 생성 시각에 머문다.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- 1. notice (공지사항)
-- published_at 하나로 비공개·예약·공개를 함께 정한다.
--   null      → 작성 중 (비공개)
--   미래 시각  → 그 시각부터 공개 (예약 게시)
--   현재·과거  → 공개. 화면에는 이 값을 게시일로 표시
create table notice (
  id           bigint generated always as identity primary key,
  title        varchar(200) not null,
  content      text not null,
  is_pinned    boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_notice_updated_at
  before update on notice
  for each row execute function set_updated_at();


-- 2. faq_category (FAQ 카테고리)
-- 화면에서 FAQ를 묶는 단위. sort_order가 카테고리끼리의 순서를 정한다 (작을수록 위에 위치).
-- 공개 여부는 따로 두지 않는다. 공개된 FAQ가 하나도 없는 카테고리는 화면에 출력되지 않는다.
create table faq_category (
  id         bigint generated always as identity primary key,
  name       varchar(30) not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_faq_category_updated_at
  before update on faq_category
  for each row execute function set_updated_at();


-- 3. faq (자주 묻는 질문)
-- category_id: 속한 카테고리. FAQ가 남아 있는 카테고리는 지울 수 없다 (on delete restrict).
-- sort_order: 같은 카테고리 안에서의 순서 (작을수록 위에 위치). 카테고리끼리의 순서는 faq_category.sort_order가 정한다.
-- is_published: 공개 여부. 화면에 게시일이 없어 boolean으로 충분하다. 기본은 비공개다.
--   notice(published_at을 비우면 비공개)와 방향을 맞춰, 콘솔에서 실수로 작성한 행이 바로 노출되지 않게 한다.
create table faq (
  id           bigint generated always as identity primary key,
  category_id  bigint not null references faq_category(id) on delete restrict,
  question     varchar(300) not null,
  answer       text not null,
  sort_order   integer not null default 0,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_faq_updated_at
  before update on faq
  for each row execute function set_updated_at();


-- 4. inquiry (1:1 문의)
-- 로그인 없이 받는 문의라 답변은 email로 직접 회신한다. 조회 API는 두지 않고 콘솔에서만 본다.
-- category: 문의 유형. 목록을 바꾸면 app/schemas/inquiry.py의 INQUIRY_CATEGORIES와 프론트 문의 폼도 함께 바꾼다.
-- status: 접수 → 처리중 → 완료. 완료로 바꾸면 resolved_at이 자동으로 채워진다.
-- consented_at: 개인정보 수집·이용에 동의한 시각. 동의하지 않으면 API가 저장하지 않는다.
-- 보유 기간: 처리 완료 후 1년 (개인정보처리방침과 같아야 한다). 기간이 지난 행은 05_inquiry_retention.sql로
--   등록하는 예약 작업이 매일 자동으로 지운다. 답변이 끝나지 않은(완료가 아닌) 문의는 지우지 않으므로 처리 후 반드시 완료로 바꾼다.
create table inquiry (
  id           bigint generated always as identity primary key,
  category     varchar(20) not null,
  email        varchar(254) not null,
  content      text not null,
  status       varchar(10) not null default '접수',
  consented_at timestamptz not null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (category in ('코스 탐색', '대회 행사', '방문 혜택', '자전거 대여', '정보 오류 신고', '기타')),
  check (status in ('접수', '처리중', '완료')),
  check (char_length(content) between 10 and 2000)
);

create trigger trg_inquiry_updated_at
  before update on inquiry
  for each row execute function set_updated_at();

-- 완료로 바뀌거나 처음부터 완료로 넣으면 resolved_at을 채우고, 완료가 아닌 상태면 비운다.
-- 보유 기간(처리 완료 후 1년)을 이 값으로 계산한다.
-- insert일 때 old는 null이라 old.status is distinct from '완료'가 참이 된다.
create or replace function set_inquiry_resolved_at()
returns trigger as $$
begin
  if new.status = '완료' and old.status is distinct from '완료' then
    new.resolved_at = now();
  elsif new.status <> '완료' then
    new.resolved_at = null;
  end if;
  return new;
end;
$$ language plpgsql;

-- insert에도 건다. 콘솔에서 처음부터 '완료'로 넣은 행의 resolved_at이 비면 자동 파기에서 빠진다.
-- 05_inquiry_retention.sql이 기존 DB에 같은 트리거를 다시 만드므로, 바꾸면 두 곳을 함께 고친다.
create trigger trg_inquiry_resolved_at
  before insert or update of status on inquiry
  for each row execute function set_inquiry_resolved_at();

-- 보유 기간이 지난 문의 자동 파기 작업은 05_inquiry_retention.sql에 있다.
-- 이 파일을 실행한 뒤 Supabase SQL Editor에서 05를 postgres 역할로 실행하고, 파일 끝의 확인 쿼리로 등록을 확인한다.


-- 행 수준 보안(RLS)
-- 이유와 주의사항은 지원금/환급 섹션 끝의 RLS 주석 참고. 새 테이블을 추가하면 여기에도 한 줄 추가한다.
alter table notice       enable row level security;
alter table faq_category enable row level security;
alter table faq          enable row level security;
alter table inquiry      enable row level security;


-- ============================================
-- 어디까지왔니 — 회원 테이블
-- ============================================
-- 카카오 로그인으로 가입한 회원. 인증은 Supabase Auth가 아니라 FastAPI가 직접 처리한다.
--   DB를 옮겨도 회원 데이터와 인증이 그대로 따라가도록 우리 스키마의 일반 테이블로 둔다.
-- 이미 운영 중인 공용 DB에는 08_app_user.sql과 09_auth_session.sql로 같은 내용을 적용한다.


-- 1. app_user (회원)
-- 이름을 user로 하지 않는 이유: Postgres 예약어라 매번 따옴표로 감싸야 한다.
-- kakao_id: 카카오 회원번호. 로그인할 때 이 값으로 회원을 찾고, 없으면 새로 만든다.
-- nickname: 처음 가입할 때 카카오 값으로 채우고, 이후에는 마이페이지에서 바꾼 값을 유지한다(로그인이 덮어쓰지 않는다).
-- bio: 한 줄 소개(선택, 40자). 마이페이지에서 적는다. 비우면 null. 쪽지·리뷰에서 작성자 소개로 쓸 예정이다.
-- 프로필 사진은 받지 않는다. 화면에 꼭 필요하지 않아 수집하는 개인정보를 줄였다.
-- 보유 기간: 탈퇴할 때까지 (개인정보처리방침과 같아야 한다). 탈퇴하면 행을 삭제한다.
-- 회원에 딸린 테이블(기록, 저장, 리뷰 등)은 app_user(id)를 on delete cascade로 참조해 탈퇴 시 함께 지운다.
create table app_user (
  id                bigint generated always as identity primary key,
  kakao_id          bigint not null unique,
  nickname          varchar(50),
  bio               varchar(40),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_app_user_updated_at
  before update on app_user
  for each row execute function set_updated_at();


-- 행 수준 보안(RLS)
-- 이유와 주의사항은 지원금/환급 섹션 끝의 RLS 주석 참고. 새 테이블을 추가하면 여기에도 한 줄 추가한다.
alter table app_user enable row level security;


-- 2. auth_session (로그인 세션)
-- JWT의 sid와 연결된다. 세션 행이 있어야 토큰이 유효하며, 로그아웃하면 현재 행만 삭제한다.
-- 회원 탈퇴나 연결 끊기 웹훅으로 app_user가 삭제되면 해당 회원의 모든 세션도 함께 삭제된다.
create table auth_session (
  id                uuid primary key,
  user_id           bigint not null references app_user(id) on delete cascade,
  expires_at        timestamptz not null
);

-- app_user 삭제 시 FK 연쇄 삭제가 세션을 빠르게 찾도록 한다.
create index idx_auth_session_user_id on auth_session(user_id);

alter table auth_session enable row level security;
