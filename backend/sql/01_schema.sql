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
  refund_value integer not null,
  is_rate      boolean not null default false,
  description  text
);


-- 5. checklist_item (준비물 체크리스트)
create table checklist_item (
  id           bigint generated always as identity primary key,
  support_id   bigint not null references support(id) on delete cascade,
  content      text not null,
  is_essential boolean not null default true,
  sort_order   integer not null default 0
);



-- ============================================
-- 어디까지왔니 — 지도/코스 테이블 (지도/코스)
-- ============================================

-- 1. course (코스)
create table course (
  id               bigint generated always as identity primary key,
  source_id        text not null unique,
  course_title     varchar(255) not null,
  description      text,
  type             varchar(20) not null,
  distance         numeric not null,
  difficulty       varchar(20),
  start_address    text,
  estimated_time   int,
  region_code      varchar(10),
  image_url        varchar(500),
  original_gpx_url varchar(500),
  start_lat        double precision,
  start_lng        double precision,
  min_lat          double precision,
  max_lat          double precision,
  min_lng          double precision,
  max_lng          double precision,
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
  addr1           varchar(255),
  addr2           varchar(255),
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
  info_center varchar(100),
  rest_date   varchar(200),
  use_time    varchar(500),
  parking     varchar(200),
  use_fee     text,
  sale_item   text
);


-- 3. accommodation (숙박 상세) — tour_spot 자식
create table accommodation (
  content_id      varchar(20) primary key references tour_spot(content_id) on delete cascade,
  checkin_time    varchar(10),
  checkout_time   varchar(10),
  parking         varchar(100),
  reservation_url text
);


-- 4. restaurant (음식점 상세) — tour_spot 자식
create table restaurant (
  content_id varchar(20) primary key references tour_spot(content_id) on delete cascade,
  first_menu varchar(200),
  treat_menu varchar(200),
  open_time  varchar(100),
  rest_date  varchar(100)
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
  nearby_type       varchar(20) not null,   -- attraction/accommodation/restaurant/bicycle/race
  nearby_content_id varchar(50) not null,
  distance_km       double precision not null,
  cached_at         timestamptz not null default now(),
  expires_at        timestamptz not null,
  unique (base_type, base_id, nearby_type, nearby_content_id)
);

-- 인덱스 생성
create index idx_nearby_base on nearby_spot (base_type, base_id);
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