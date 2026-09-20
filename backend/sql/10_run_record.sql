-- ============================================
-- 10_run_record.sql
-- 따라가기 완주 기록 테이블 추가 (이미 운영 중인 공용 DB용)
-- ============================================
-- 새로 DB를 만들 때는 01_schema.sql에 같은 내용이 있으니 이 파일을 실행하지 않는다.
-- 01_schema.sql의 회원 섹션과 같게 유지한다.
--
-- 실행 방법
-- - 09_auth_session.sql 적용 뒤 Supabase SQL Editor에서 이 파일 전체를 postgres 역할로 실행한다.
-- - 테이블과 인덱스를 추가하고 RLS를 켜므로 다시 실행해도 된다.
-- - 백엔드보다 먼저 실행한다.


create table if not exists public.run_record (
  id                bigint generated always as identity primary key,
  user_id           bigint not null references public.app_user(id) on delete cascade,
  course_id         bigint not null references public.course(id) on delete cascade,
  route_type        varchar(10) not null check (route_type in ('trail', 'bicycle')),
  distance_km       numeric(7, 3) not null check (distance_km > 0),
  duration_ms       bigint not null check (duration_ms > 0),
  pace_sec_per_km   numeric(8, 2) check (pace_sec_per_km > 0),
  finished_at       timestamptz not null,
  created_at        timestamptz not null default now()
);

-- 마이페이지 목록: 내 기록을 최근 순으로
create index if not exists idx_run_record_user_finished
  on public.run_record (user_id, finished_at desc);

alter table public.run_record enable row level security;


-- ============================================
-- 실행 후 확인 (따로 실행)
-- ============================================
-- 테이블과 RLS: relrowsecurity가 true여야 한다.
-- select relname, relrowsecurity from pg_class where relname = 'run_record';
--
-- 외래키 삭제 정책: 두 행 모두 confdeltype이 c(cascade)여야 한다.
-- select conname, confdeltype from pg_constraint where conrelid = 'public.run_record'::regclass and contype = 'f';
