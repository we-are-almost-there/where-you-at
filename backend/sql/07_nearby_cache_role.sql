-- =====================================================================
-- 07_nearby_cache_role.sql
-- GitHub Actions 주변정보 캐시 갱신 전용 최소 권한 역할
-- =====================================================================
-- 실행 방법
-- - Supabase SQL Editor에서 이 파일 전체를 postgres 역할로 실행한다.
-- - 비밀번호는 이 파일에 적지 않는다. 실행 후 아래 주석의 ALTER ROLE을 별도로 실행한다.
-- - 다시 실행해도 된다. 기존 역할의 비밀번호는 바꾸지 않고 권한과 RLS 정책만 맞춘다.
--
-- 이 역할은 scripts/refresh_nearby_cache.py가 쓰는 범위만 다룬다.
-- - course, course_waypoint, tour_spot, bicycle_facility: 조회
-- - nearby_spot: base_type = 'course'인 행의 조회·삽입·일부 열 수정·삭제
-- 문의(inquiry) 등 다른 테이블 권한은 주지 않는다.
-- --clean-expired를 이 역할로 실행하면 코스 캐시만 지워진다(정책이 course로 제한).


do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'nearby_cache_refresher') then
    create role nearby_cache_refresher
      login
      nocreatedb
      nocreaterole
      noinherit;
  end if;
end
$$;

alter role nearby_cache_refresher
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
    where rolname = 'nearby_cache_refresher'
      and (rolsuper or rolbypassrls or rolreplication)
  ) then
    raise exception 'nearby_cache_refresher has an unsafe elevated attribute';
  end if;
end
$$;

grant connect on database postgres to nearby_cache_refresher;
grant usage on schema public to nearby_cache_refresher;

-- PostGIS는 extensions 스키마에 있다. 캐시 SQL이 ST_MakeLine, ST_DWithin 등을 스키마 없이
-- 부르므로, 스키마 사용 권한과 postgres 역할과 같은 search_path가 없으면
-- "function ... does not exist"로 실패한다.
grant usage on schema extensions to nearby_cache_refresher;
alter role nearby_cache_refresher set search_path = public, extensions;

-- 재실행할 때도 대상 테이블의 권한을 초기화한 뒤 필요한 것만 다시 준다.
-- public 전체를 대상으로 하면 PostGIS 등 확장 소유 객체까지 건드릴 수 있어 범위를 좁힌다.
revoke all privileges on
  public.course,
  public.course_waypoint,
  public.tour_spot,
  public.bicycle_facility,
  public.nearby_spot
  from nearby_cache_refresher;
revoke all privileges on sequence public.nearby_spot_id_seq
  from nearby_cache_refresher;

-- 라이브 조회·갱신 대상 선택·캐시 조회에 필요한 원본 테이블
grant select on
  public.course,
  public.course_waypoint,
  public.tour_spot,
  public.bicycle_facility
  to nearby_cache_refresher;

-- 캐시 교체: 조합별 DELETE 후 INSERT ... ON CONFLICT DO UPDATE
-- (ON CONFLICT 판정과 캐시 조회에 SELECT가 필요하다)
grant select, delete on public.nearby_spot to nearby_cache_refresher;
grant insert (
  base_type,
  base_id,
  nearby_type,
  nearby_content_id,
  route_type,
  distance_km,
  cached_at,
  expires_at
) on public.nearby_spot to nearby_cache_refresher;
grant update (
  distance_km,
  cached_at,
  expires_at
) on public.nearby_spot to nearby_cache_refresher;
-- id는 identity 열이다. 06과 같은 방식으로 시퀀스 권한을 준다.
grant usage, select on sequence public.nearby_spot_id_seq
  to nearby_cache_refresher;

-- 대상 테이블은 모두 RLS가 켜져 있고, 기존 정책은 다른 역할용뿐이라 이 역할용 정책이 필요하다.
drop policy if exists nearby_cache_refresher_select on public.course;
create policy nearby_cache_refresher_select
  on public.course
  for select
  to nearby_cache_refresher
  using (true);

drop policy if exists nearby_cache_refresher_select on public.course_waypoint;
create policy nearby_cache_refresher_select
  on public.course_waypoint
  for select
  to nearby_cache_refresher
  using (true);

drop policy if exists nearby_cache_refresher_select on public.tour_spot;
create policy nearby_cache_refresher_select
  on public.tour_spot
  for select
  to nearby_cache_refresher
  using (true);

drop policy if exists nearby_cache_refresher_select on public.bicycle_facility;
create policy nearby_cache_refresher_select
  on public.bicycle_facility
  for select
  to nearby_cache_refresher
  using (true);

-- nearby_spot은 갱신 스크립트가 쓰는 코스 캐시만 다루게 제한한다.
drop policy if exists nearby_cache_refresher_select on public.nearby_spot;
create policy nearby_cache_refresher_select
  on public.nearby_spot
  for select
  to nearby_cache_refresher
  using (base_type = 'course');

drop policy if exists nearby_cache_refresher_insert on public.nearby_spot;
create policy nearby_cache_refresher_insert
  on public.nearby_spot
  for insert
  to nearby_cache_refresher
  with check (base_type = 'course');

drop policy if exists nearby_cache_refresher_update on public.nearby_spot;
create policy nearby_cache_refresher_update
  on public.nearby_spot
  for update
  to nearby_cache_refresher
  using (base_type = 'course')
  with check (base_type = 'course');

drop policy if exists nearby_cache_refresher_delete on public.nearby_spot;
create policy nearby_cache_refresher_delete
  on public.nearby_spot
  for delete
  to nearby_cache_refresher
  using (base_type = 'course');


-- =====================================================================
-- 비밀번호 설정 (따로 실행하고, 실행 기록을 저장하지 않는다)
-- =====================================================================
-- 비밀번호 관리자에서 긴 무작위 값을 만든 뒤 아래 자리만 바꾼다.
-- alter role nearby_cache_refresher password '<RANDOM_PASSWORD>';
--
-- GitHub Actions Repository Secrets (호스트·포트·DB 이름은 06의 DB_HOST·DB_PORT·DB_NAME을 함께 쓴다)
-- NEARBY_DB_USER     = nearby_cache_refresher.<PROJECT_REF>
-- NEARBY_DB_PASSWORD = 위에서 설정한 무작위 비밀번호
--
-- Supabase 공식 형식상 shared pooler의 사용자 정의 역할 이름 뒤에는
-- 반드시 .<PROJECT_REF>를 붙인다. DB_PORT는 transaction pooler 6543이다.


-- =====================================================================
-- 실행 후 확인 (따로 실행)
-- =====================================================================
-- 1) 허용된 테이블·열 권한
-- select table_name, privilege_type
-- from information_schema.role_table_grants
-- where grantee = 'nearby_cache_refresher'
-- order by table_name, privilege_type;
--
-- select table_name, column_name, privilege_type
-- from information_schema.role_column_grants
-- where grantee = 'nearby_cache_refresher'
-- order by table_name, column_name, privilege_type;
--
-- 2) RLS 정책 8개 (원본 테이블 조회 4개 + nearby_spot 4개)
-- select tablename, policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'public'
--   and policyname like 'nearby_cache_refresher_%'
-- order by tablename, policyname;
--
-- 3) PostGIS 사용 준비: 모두 true, search_path에 extensions가 있어야 한다.
-- select
--   has_schema_privilege('nearby_cache_refresher', 'extensions', 'USAGE') as can_use_extensions,
--   has_function_privilege('nearby_cache_refresher',
--     'extensions.st_makepoint(double precision, double precision)', 'EXECUTE') as can_call_postgis;
-- select s.setconfig
-- from pg_db_role_setting s
-- join pg_roles r on r.oid = s.setrole
-- where r.rolname = 'nearby_cache_refresher';
--
-- 4) 원본 테이블 쓰기와 문의 접근은 모두 false여야 한다.
-- select
--   has_table_privilege('nearby_cache_refresher', 'public.course', 'INSERT') as can_insert_course,
--   has_table_privilege('nearby_cache_refresher', 'public.tour_spot', 'UPDATE') as can_update_tour_spot,
--   has_table_privilege('nearby_cache_refresher', 'public.bicycle_facility', 'INSERT')
--     as can_insert_bicycle,
--   has_table_privilege('nearby_cache_refresher', 'public.inquiry', 'SELECT') as can_read_inquiry;
--
-- 5) 실제 읽기·쓰기 확인: 갱신 대상이 0건이면 쓰기 권한은 확인되지 않으므로,
--    이 역할로 코스 하나를 강제 갱신한다(scripts/refresh_nearby_cache.py --course-id).
--    코스 캐시를 같은 내용으로 다시 만드는 작업이라 서비스에 영향이 없다.
