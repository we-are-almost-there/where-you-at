-- ============================================
-- 10_saved_course.sql
-- 찜한 코스 테이블 추가 (이미 운영 중인 공용 DB용)
-- ============================================
-- 새로 DB를 만들 때는 01_schema.sql에 같은 내용이 있으니 이 파일을 실행하지 않는다.
-- 01_schema.sql의 회원 섹션과 같게 유지한다. 바꾸면 두 곳을 함께 고친다.
-- 09번은 로그인 세션(auth_session) 작업이 쓰고 있어 이 파일은 10번을 쓴다.
--
-- 실행 방법
-- - 08_app_user.sql 적용 뒤 Supabase SQL Editor에서 이 파일 전체를 postgres 역할로 실행한다.
-- - 테이블과 인덱스를 추가하기만 하므로 기존 기능에는 영향이 없다. 공용 DB라 실행 전에 팀에 알린다.
-- - 이 파일을 먼저 실행하고 백엔드를 배포한다. 순서가 바뀌면 찜 API가 500을 돌려준다.
-- - 다시 실행해도 된다. 이미 있으면 그대로 두고, RLS만 다시 켠다.
--
-- 코스가 아니라 "코스 + 종목"을 찜한다. 코스 목록이 도보·자전거 탭으로 나뉘고 한 코스가 두 종목을 다 가질 수
-- 있어서, 자전거로 찜한 코스는 마이페이지에서도 자전거로 보여 줘야 하기 때문이다.
-- 종목 FK를 course_route(course_id, route_type)로 걸어, 자전거 경로가 없는 코스를 자전거로 찜하는 요청을
-- DB가 막고 코스나 경로가 지워지면 찜도 함께 정리되게 한다.


create table if not exists public.saved_course (
  user_id          bigint not null,
  course_id        bigint not null,
  route_type       varchar(10) not null,
  created_at       timestamptz not null default now(),
  primary key (user_id, course_id, route_type),
  constraint saved_course_user_fk foreign key (user_id)
    references public.app_user(id) on delete cascade,
  constraint saved_course_route_fk foreign key (course_id, route_type)
    references public.course_route(course_id, route_type) on delete cascade
);

create index if not exists idx_saved_course_user_created
  on public.saved_course(user_id, created_at desc);

alter table public.saved_course enable row level security;


-- ============================================
-- 실행 후 확인 (따로 실행)
-- ============================================
-- 테이블과 RLS: relrowsecurity가 true여야 한다.
-- select relname, relrowsecurity from pg_class where relname = 'saved_course';
--
-- 외래키 두 개: 둘 다 confdeltype이 c(cascade)여야 한다.
-- select conname, confdeltype from pg_constraint
--   where conrelid = 'public.saved_course'::regclass and contype = 'f';
--
-- 인덱스: 기본키와 idx_saved_course_user_created 두 행이 나와야 한다.
-- select indexname from pg_indexes where tablename = 'saved_course';
