-- ============================================
-- 08_app_user.sql
-- 카카오 로그인 회원 테이블 추가 (이미 운영 중인 공용 DB용)
-- ============================================
-- 새로 DB를 만들 때는 01_schema.sql에 같은 내용이 있으니 이 파일을 실행하지 않는다.
-- 01_schema.sql의 회원 섹션과 같게 유지한다. 바꾸면 두 곳을 함께 고친다.
--
-- 실행 방법
-- - Supabase SQL Editor에서 이 파일 전체를 postgres 역할로 실행한다.
-- - 테이블과 빈 칸을 추가하기만 하므로 기존 기능에는 영향이 없다. 공용 DB라 실행 전에 팀에 알린다.
-- - 백엔드가 이 파일의 칸을 모두 읽으므로, 칸을 더한 뒤에는 이 파일을 먼저 실행하고 백엔드를 배포한다.
--   순서가 바뀌면 /api/me와 로그인이 500을 돌려준다.
-- - 다시 실행해도 된다. 이미 있는 테이블은 그대로 두고, 빠진 칸만 추가하고, updated_at 트리거는 지운 뒤 다시 만들고, RLS를 다시 켠다.
-- - 회원 테이블에 칸을 더하면 create table과 아래 add column 두 곳에 함께 적는다.
--   create table은 처음 실행하는 DB용이고, 이미 이 파일을 실행한 DB는 테이블이 있어 건너뛰므로 add column이 칸을 채운다.
-- - set_updated_at()은 01_schema.sql 고객지원 섹션에서 만든 함수를 쓴다.


create table if not exists public.app_user (
  id                bigint generated always as identity primary key,
  kakao_id          bigint not null unique,
  nickname          varchar(50),
  bio               varchar(40),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 한 줄 소개(2026-09 추가). 이 칸이 생기기 전에 이 파일을 실행한 DB용.
alter table public.app_user add column if not exists bio varchar(40);

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
-- 칸: id, kakao_id, nickname, bio, created_at, updated_at 여섯 행이 나와야 한다. bio는 character varying 40.
--     add column으로 채운 DB는 bio가 맨 끝에 온다. 순서는 달라도 된다.
-- select column_name, data_type, character_maximum_length
--   from information_schema.columns where table_name = 'app_user' order by ordinal_position;
--
-- 트리거: trg_app_user_updated_at 한 행이 나와야 한다.
-- select tgname from pg_trigger where tgrelid = 'public.app_user'::regclass and not tgisinternal;
