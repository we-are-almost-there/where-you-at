-- ============================================
-- 05_inquiry_retention.sql
-- 1:1 문의 보유 기간이 지난 행 자동 파기 (Supabase Cron = pg_cron)
-- ============================================
-- 보유 기간: 처리 완료 후 1년 (개인정보처리방침 5번, 01_schema.sql inquiry 주석과 같아야 한다).
-- 이 작업이 DB에 등록돼 있어야 방침의 "매일 자동 파기"가 사실이다.
--
-- 실행 방법
-- - Supabase SQL Editor에서 이 파일 전체를 postgres 역할로 실행한다.
--   inquiry는 RLS가 켜져 있고 정책이 없어서, 다른 역할로 등록하면 에러 없이 0건만 지운다.
-- - 01_schema.sql로 테이블을 만든 뒤에 실행한다. 이미 운영 중인 공용 DB에도 그대로 실행하면 된다.
-- - 다시 실행해도 된다. 트리거는 지우고 다시 만들고, 같은 이름의 작업은 새로 만들지 않고 덮어쓴다.
-- - pg_cron이 없는 로컬 Postgres에서는 확장 생성에서 실패한다. 그 환경에서는 보유 기간이 지난 문의를 직접 지운다.
-- - 시각·보유 기간·삭제 조건을 바꾸면 이 파일을 고쳐 다시 실행하고, 방침 5번도 함께 고친다.


-- 1. 처음부터 '완료'로 넣은 문의에도 resolved_at 채우기
-- 파기 조건이 resolved_at이라, 콘솔에서 행을 처음부터 status = '완료'로 넣으면 resolved_at이 비어 영영 지워지지 않는다.
-- 트리거를 insert에도 걸어 막는다. 01_schema.sql의 trg_inquiry_resolved_at과 같게 유지한다.
drop trigger if exists trg_inquiry_resolved_at on public.inquiry;
create trigger trg_inquiry_resolved_at
  before insert or update of status on public.inquiry
  for each row execute function public.set_inquiry_resolved_at();


-- 2. 매일 파기 작업 등록
-- 시각은 UTC다. '0 18 * * *' = 한국 시간(KST) 매일 03:00.
-- 테이블은 public.inquiry로 적어 작업 실행 시 search_path에 영향을 받지 않게 한다.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'delete-expired-inquiries',
  '0 18 * * *',
  $job$delete from public.inquiry where status = '완료' and resolved_at < now() - interval '1 year'$job$
);


-- ============================================
-- 실행 후 확인 (따로 실행)
-- ============================================
-- 1) 작업: 정확히 1행, active = true, username = postgres, database = postgres,
--    schedule = '0 18 * * *', command가 위 delete 문과 같은지
--      select jobid, jobname, schedule, command, database, username, active
--      from cron.job
--      where jobname = 'delete-expired-inquiries';
--
-- 2) 트리거: 정의에 "BEFORE INSERT OR UPDATE OF status"가 들어 있는지
--      select pg_get_triggerdef(oid) from pg_trigger where tgname = 'trg_inquiry_resolved_at';
--
-- 3) 파기에서 빠질 행: 0건이어야 한다. 있으면 콘솔에서 resolved_at을 처리 완료 시각으로 채운다.
--      select count(*) from public.inquiry where status = '완료' and resolved_at is null;
--
-- 4) 첫 실행 기록(등록 다음 날 03:00 이후): status = 'succeeded'인지
--      select start_time, status, return_message
--      from cron.job_run_details
--      where jobid = (select jobid from cron.job where jobname = 'delete-expired-inquiries')
--      order by start_time desc
--      limit 10;
