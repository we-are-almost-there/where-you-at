from psycopg2.extras import RealDictCursor


_POLICIES_FOR_CALC_SQL = """
with active_support as (
    -- 이 지역에 적용되면서 '지금 진행 중'인 제도만 추림
    select distinct s.id, s.support_title, s.max_amount, s.is_pre_approval, s.apply_url
    from support s
    join support_region sr on sr.support_id = s.id
    join region r on r.id = sr.region_id
    left join support_schedule ss
        on ss.support_id = s.id and ss.region_id = r.id
    where r.region_code = %(region_code)s
      and (
            -- schedule이 있는 제도: 이 지역이 '접수중' 상태여야 함
            exists (
                select 1 from support_schedule ss2
                where ss2.support_id = s.id
                  and ss2.region_id = r.id
                  and ss2.status = '접수중'
            )
            -- schedule이 없는 제도(관광주민증·숙박세일): 지원 기간에 현재 날짜가 포함돼야 함
            or (
                not exists (
                    select 1 from support_schedule ss3
                    where ss3.support_id = s.id and ss3.region_id = r.id
                )
                and (s.end_date is null or s.end_date >= current_date)
                and (s.start_date is null or s.start_date <= current_date)
            )
      )
)
select
    a.id as support_id,
    a.support_title,
    a.max_amount,
    a.is_pre_approval,
    a.apply_url,
    rr.category,
    rr.min_spend,
    rr.min_nights,
    rr.max_nights,
    rr.cap_at_spend,
    rr.refund_value,
    rr.is_rate,
    rr.override_region_id,
    rr.description
from active_support a
join refund_rule rr on rr.support_id = a.id
-- override 규칙은 해당 지역일 때, 공통 규칙은 override 지역이 아닐 때 적용
left join region r on r.region_code = %(region_code)s
where rr.override_region_id is null
   or rr.override_region_id = r.id
"""


def get_policies_for_calc(conn, region_code: str) -> list[dict]:
    """지역에 적용되는 '진행 중'인 제도 + 환급 규칙 조회

    - 진행 중 판정: schedule 있는 제도는 '접수중' 차수 존재, 없는 제도는 support 날짜.
    - override 규칙: 해당 지역 전용 규칙이 있으면 계산에서 우선 적용
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(_POLICIES_FOR_CALC_SQL, {"region_code": region_code})
        return cur.fetchall()
    
    # ── 목록 (GET /api/support) ──────────────────────────
_SUPPORT_LIST_SQL = """
select distinct
    s.id,
    s.support_title as title,
    s.agency,
    s.summary,
    s.max_amount,
    to_char(s.end_date, 'YYYY-MM-DD') as end_date
from support s
join support_region sr on sr.support_id = s.id
join region r on r.id = sr.region_id
where r.region_code = %(region_code)s
  and (
        exists (
            select 1 from support_schedule ss
            where ss.support_id = s.id and ss.region_id = r.id
              and ss.status = '접수중'
        )
        or (
            not exists (
                select 1 from support_schedule ss
                where ss.support_id = s.id and ss.region_id = r.id
            )
            and (s.end_date is null or s.end_date >= current_date)
            and (s.start_date is null or s.start_date <= current_date)
        )
  )
order by s.max_amount desc nulls last
"""


def get_support_list(conn, region_code: str) -> list[dict]:
    """지역에 적용되는 '진행 중' 지원 제도 목록"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(_SUPPORT_LIST_SQL, {"region_code": region_code})
        return cur.fetchall()


# ── 상세 (GET /api/support/{id}) ─────────────────────
_SUPPORT_DETAIL_SQL = """
select
    s.id,
    s.support_title as title,
    s.description,
    s.apply_url
from support s
where s.id = %(id)s
"""

_CHECKLIST_SQL = """
select id, content, is_essential
from checklist_item
where support_id = %(id)s
order by sort_order
"""


def get_support_detail(conn, support_id: int) -> dict | None:
    """지원 제도의 상세 내용 + 체크리스트"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(_SUPPORT_DETAIL_SQL, {"id": support_id})
        support = cur.fetchone()
        if not support:
            return None
        cur.execute(_CHECKLIST_SQL, {"id": support_id})
        support["checklist"] = cur.fetchall()
        return support