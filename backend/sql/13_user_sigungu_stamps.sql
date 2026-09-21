-- ============================================
-- 13_user_sigungu_stamps.sql
-- 시군구 스탬프 테이블과 기록의 완주 여부 추가 (이미 운영 중인 공용 DB용)
-- ============================================
-- 새로 DB를 만들 때는 01_schema.sql에 같은 내용이 있으니 이 파일을 실행하지 않는다.
-- 01_schema.sql의 회원 섹션과 같게 유지한다. 바꾸면 두 곳을 함께 고친다.
--
-- 실행 방법
-- - 11_run_record.sql과 12_record_card.sql 적용 뒤 Supabase SQL Editor에서 이 파일 전체를 postgres 역할로 실행한다.
-- - 완주 여부 컬럼, 테이블과 UNIQUE 인덱스를 추가하고 RLS를 켠다. 다시 실행해도 된다.
-- - 백엔드보다 먼저 실행한다. 적용 전에는 RECORD_FEATURES_ENABLED를 켜지 않는다.
--
-- 사용자가 직접 찍은 시군구와 시각만 저장한다. AVAILABLE/LOCKED 상태는 저장하지 않고,
-- 로그인 회원의 run_record 중 is_completed가 true인 기록과 course.region_code를 조인해 계산한다.
-- 시도 도장은 시군구 스탬프에서 화면이 파생하므로 별도로 저장하지 않는다.


-- 기존 기록은 완주 여부를 알 수 없으므로 false로 둔다. 이미 찍은 스탬프는 유지한다.
alter table public.run_record
  add column if not exists is_completed boolean not null default false;


create table if not exists public.user_sigungu_stamps (
  id            bigint generated always as identity primary key,
  user_id       bigint not null references public.app_user(id) on delete cascade,
  sigungu_code  varchar(10) not null references public.region(region_code),
  stamped_at    timestamptz not null default now(),
  -- 같은 회원이 같은 시군구에 여러 번 찍어도 한 행만 저장한다.
  constraint uq_user_sigungu_stamps unique (user_id, sigungu_code)
);

-- UNIQUE 인덱스의 첫 컬럼이 user_id라 내 스탬프 조회와 회원 탈퇴 시 연쇄 삭제에도 사용된다.
-- 같은 컬럼으로 사용자별 조회 인덱스를 따로 만들지 않는다.
alter table public.user_sigungu_stamps enable row level security;


-- ============================================
-- 실행 후 확인 (따로 실행)
-- ============================================
-- 완주 여부 컬럼: is_nullable은 NO, column_default는 false여야 한다.
-- select column_name, is_nullable, column_default from information_schema.columns
--   where table_schema = 'public' and table_name = 'run_record' and column_name = 'is_completed';
--
-- 테이블과 RLS: relrowsecurity가 true여야 한다.
-- select relname, relrowsecurity from pg_class where relname = 'user_sigungu_stamps';
--
-- 외래키: user_id는 app_user를 참조하고 confdeltype이 c(cascade), sigungu_code는 region을 참조하고 a(no action)여야 한다.
-- select conname, confdeltype from pg_constraint
--   where conrelid = 'public.user_sigungu_stamps'::regclass and contype = 'f';
--
-- 인덱스: 기본키와 uq_user_sigungu_stamps 두 행이 나와야 한다.
-- select indexname from pg_indexes where tablename = 'user_sigungu_stamps';
