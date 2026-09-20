-- ============================================
-- 11_record_card.sql
-- 기록 카드 테이블 추가 (이미 운영 중인 공용 DB용)
-- ============================================
-- 새로 DB를 만들 때는 01_schema.sql에 같은 내용이 있으니 이 파일을 실행하지 않는다.
-- 01_schema.sql의 회원 섹션과 같게 유지한다.
--
-- 실행 방법
-- - 10_run_record.sql 적용 뒤 Supabase SQL Editor에서 이 파일 전체를 postgres 역할로 실행한다.
-- - 테이블과 인덱스를 추가하고 RLS를 켜므로 다시 실행해도 된다.
-- - 백엔드보다 먼저 실행한다.


create table if not exists public.record_card (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references public.app_user(id) on delete cascade,
  record_id   bigint not null references public.run_record(id) on delete cascade,
  -- R2 키(record-cards/{user_id}/...). URL은 만료되므로 저장하지 않고 조회 때 발급한다.
  image_key   varchar(200) not null,
  created_at  timestamptz not null default now()
);

-- 마이페이지 목록: 내 카드를 최근 순으로
create index if not exists idx_record_card_user_created
  on public.record_card (user_id, created_at desc);

-- 기록이 지워질 때 FK 연쇄 삭제가 카드를 빠르게 찾도록 한다.
create index if not exists idx_record_card_record_id
  on public.record_card (record_id);

alter table public.record_card enable row level security;


-- ============================================
-- 실행 후 확인 (따로 실행)
-- ============================================
-- 테이블과 RLS: relrowsecurity가 true여야 한다.
-- select relname, relrowsecurity from pg_class where relname = 'record_card';
--
-- 외래키 삭제 정책: 두 행 모두 confdeltype이 c(cascade)여야 한다.
-- select conname, confdeltype from pg_constraint where conrelid = 'public.record_card'::regclass and contype = 'f';
