-- ============================================
-- 08_app_user.sql
-- 카카오 로그인 회원 테이블 추가 (이미 운영 중인 공용 DB용)
-- ============================================
-- 새로 DB를 만들 때는 01_schema.sql에 같은 내용이 있으니 이 파일을 실행하지 않는다.
-- 01_schema.sql의 회원 섹션과 같게 유지한다. 바꾸면 두 곳을 함께 고친다.
--
-- 실행 방법
-- - Supabase SQL Editor에서 이 파일 전체를 postgres 역할로 실행한다.
-- - 테이블을 추가하기만 하므로 기존 기능에는 영향이 없다. 공용 DB라 실행 전에 팀에 알린다.
-- - 다시 실행해도 된다. 이미 있는 테이블은 그대로 두고, updated_at 트리거는 지운 뒤 다시 만들고, RLS를 다시 켠다.
-- - set_updated_at()은 01_schema.sql 고객지원 섹션에서 만든 함수를 쓴다.


create table if not exists public.app_user (
  id                bigint generated always as identity primary key,
  kakao_id          bigint not null unique,
  nickname          varchar(50),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_app_user_updated_at on public.app_user;
create trigger trg_app_user_updated_at
  before update on public.app_user
  for each row execute function public.set_updated_at();

alter table public.app_user enable row level security;


-- ============================================
-- 실행 후 확인 (따로 실행)
-- ============================================
-- 테이블과 RLS: relrowsecurity가 true여야 한다.
-- select relname, relrowsecurity from pg_class where relname = 'app_user';
--
-- 트리거: trg_app_user_updated_at 한 행이 나와야 한다.
-- select tgname from pg_trigger where tgrelid = 'public.app_user'::regclass and not tgisinternal;
