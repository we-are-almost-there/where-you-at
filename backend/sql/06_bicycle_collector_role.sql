-- =====================================================================
-- 06_bicycle_collector_role.sql
-- GitHub Actions 자전거 실시간 수집 전용 최소 권한 역할
-- =====================================================================
-- 실행 방법
-- - Supabase SQL Editor에서 이 파일 전체를 postgres 역할로 실행한다.
-- - 비밀번호는 이 파일에 적지 않는다. 실행 후 아래 주석의 ALTER ROLE을 별도로 실행한다.
-- - 다시 실행해도 된다. 기존 역할의 비밀번호는 바꾸지 않고 권한과 RLS 정책만 맞춘다.
--
-- 이 역할은 bicycle_facility의 조회·삽입·일부 열 수정만 할 수 있다.
-- DELETE 권한과 다른 테이블 권한은 주지 않는다.


do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'bicycle_realtime_collector') then
    create role bicycle_realtime_collector
      login
      nocreatedb
      nocreaterole
      noinherit;
  end if;
end
$$;

alter role bicycle_realtime_collector
  login
  nocreatedb
  nocreaterole
  noinherit
  valid until 'infinity';

-- Supabase의 postgres 역할은 실제 superuser가 아니라 SUPERUSER/BYPASSRLS를 해제할 수 없다.
-- 누군가 역할을 과도하게 승격했다면 그대로 진행하지 말고 즉시 실패시킨다.
do $$
begin
  if exists (
    select 1
    from pg_roles
    where rolname = 'bicycle_realtime_collector'
      and (rolsuper or rolbypassrls or rolreplication)
  ) then
    raise exception 'bicycle_realtime_collector has an unsafe elevated attribute';
  end if;
end
$$;

grant connect on database postgres to bicycle_realtime_collector;
grant usage on schema public to bicycle_realtime_collector;

-- 재실행할 때도 수집 대상의 권한을 초기화한 뒤 필요한 것만 다시 준다.
-- public 전체를 대상으로 하면 PostGIS 등 확장 소유 객체까지 건드릴 수 있어 범위를 좁힌다.
revoke all privileges on public.bicycle_facility from bicycle_realtime_collector;
revoke all privileges on sequence public.bicycle_facility_bicycle_id_seq
  from bicycle_realtime_collector;

grant select on public.bicycle_facility to bicycle_realtime_collector;
grant insert (
  source_id,
  facility_title,
  addr1,
  map_x,
  map_y,
  geom,
  facility_type,
  available_bikes,
  created_at,
  synced_at,
  realtime_synced_at
) on public.bicycle_facility to bicycle_realtime_collector;
grant update (
  facility_title,
  map_x,
  map_y,
  geom,
  available_bikes,
  realtime_synced_at
) on public.bicycle_facility to bicycle_realtime_collector;
grant usage, select on sequence public.bicycle_facility_bicycle_id_seq
  to bicycle_realtime_collector;

-- bicycle_facility에는 RLS가 켜져 있으므로 일반 역할용 정책이 필요하다.
drop policy if exists bicycle_realtime_collector_select on public.bicycle_facility;
create policy bicycle_realtime_collector_select
  on public.bicycle_facility
  for select
  to bicycle_realtime_collector
  using (true);

drop policy if exists bicycle_realtime_collector_insert on public.bicycle_facility;
create policy bicycle_realtime_collector_insert
  on public.bicycle_facility
  for insert
  to bicycle_realtime_collector
  with check (true);

drop policy if exists bicycle_realtime_collector_update on public.bicycle_facility;
create policy bicycle_realtime_collector_update
  on public.bicycle_facility
  for update
  to bicycle_realtime_collector
  using (true)
  with check (true);


-- =====================================================================
-- 비밀번호 설정 (따로 실행하고, 실행 기록을 저장하지 않는다)
-- =====================================================================
-- 비밀번호 관리자에서 긴 무작위 값을 만든 뒤 아래 자리만 바꾼다.
-- alter role bicycle_realtime_collector password '<RANDOM_PASSWORD>';
--
-- GitHub Actions Repository Secrets
-- DB_HOST     = Supabase Connect 창의 shared transaction pooler 호스트
-- DB_PORT     = 6543
-- DB_NAME     = postgres
-- DB_USER     = bicycle_realtime_collector.<PROJECT_REF>
-- DB_PASSWORD = 위에서 설정한 무작위 비밀번호
-- TOUR_API_KEY= 공공데이터포털 일반 인증키(디코딩 값)
--
-- Supabase 공식 형식상 shared pooler의 사용자 정의 역할 이름 뒤에는
-- 반드시 .<PROJECT_REF>를 붙인다.


-- =====================================================================
-- 실행 후 확인 (따로 실행)
-- =====================================================================
-- 1) 허용된 테이블·열 권한
-- select privilege_type
-- from information_schema.role_table_grants
-- where grantee = 'bicycle_realtime_collector'
-- order by table_name, privilege_type;
--
-- select table_name, column_name, privilege_type
-- from information_schema.role_column_grants
-- where grantee = 'bicycle_realtime_collector'
-- order by table_name, column_name, privilege_type;
--
-- 2) RLS 정책 3개
-- select policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'bicycle_facility'
--   and policyname like 'bicycle_realtime_collector_%'
-- order by policyname;
--
-- 3) DELETE 및 inquiry 접근은 모두 false여야 한다.
-- select
--   has_table_privilege('bicycle_realtime_collector', 'public.bicycle_facility', 'DELETE')
--     as can_delete_bicycle,
--   has_table_privilege('bicycle_realtime_collector', 'public.inquiry', 'SELECT')
--     as can_read_inquiry,
--   has_table_privilege('bicycle_realtime_collector', 'public.inquiry', 'INSERT')
--     as can_insert_inquiry;
