-- ============================================
-- 09_auth_session.sql
-- 서버 로그아웃과 탈퇴 회원 토큰 차단을 위한 로그인 세션 추가
-- ============================================
-- 새로 DB를 만들 때는 01_schema.sql에 같은 내용이 있으니 이 파일을 실행하지 않는다.
-- 01_schema.sql의 회원 섹션과 같게 유지한다.
--
-- 실행 방법
-- - 08_app_user.sql 적용 뒤 Supabase SQL Editor에서 이 파일 전체를 postgres 역할로 실행한다.
-- - 테이블과 인덱스를 추가하고 RLS를 켜므로 다시 실행해도 된다.


create table if not exists public.auth_session (
  id                uuid primary key,
  user_id           bigint not null references public.app_user(id) on delete cascade,
  expires_at        timestamptz not null
);

create index if not exists idx_auth_session_user_id on public.auth_session(user_id);

alter table public.auth_session enable row level security;


-- ============================================
-- 실행 후 확인 (따로 실행)
-- ============================================
-- 테이블과 RLS: relrowsecurity가 true여야 한다.
-- select relname, relrowsecurity from pg_class where relname = 'auth_session';
--
-- 외래키 삭제 정책: confdeltype이 c(cascade)여야 한다.
-- select conname, confdeltype from pg_constraint where conrelid = 'public.auth_session'::regclass;
