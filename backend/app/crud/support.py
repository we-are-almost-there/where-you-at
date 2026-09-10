from psycopg2.extras import RealDictCursor


# ── '진행 중' 판정 ────────────────────────────────────
# 목록(GET /api/support)·지도(GET /api/support/regions)·환급 계산이 모두 같은 기준을
# 써야 한다. 다르면 "지도는 색칠했는데 제도가 없어요"거나 "목록엔 없는데 환급은 계산된다"가
# 된다. 주석으로 "같게 유지할 것"이라고만 두면 언젠가 한쪽만 고쳐지므로, 한 곳에 두고
# 세 쿼리가 끼워 넣어 갈라질 수 없게 한다.
#
# 제도 기간이 열려 있는 것을 공통 전제로 두고, 그 안에서
#   1) 차수가 있는 제도는 '접수중'이면서 신청 기간 안이어야 하고
#   2) 차수가 없는 제도는 제도 기간만으로 판단한다
#
# status만 보면 조기 마감(기간은 남았는데 예산 소진)은 잡히지만, 상태 갱신이 누락된
# 지난 차수가 계속 '접수중'으로 남아 만료된 지역이 활성으로 보인다. 실제로 시드의
# 반값여행 3곳(영광·해남·거창)이 제도 종료일(2026-08-31)이 지났는데도 '접수중'이다.
# 그래서 status와 날짜를 함께 본다.
#
# 쓰는 쪽은 support를 s, region을 r로 별칭해야 한다.
_ACTIVE_PREDICATE = """
        (s.start_date is null or s.start_date <= current_date)
        and (s.end_date is null or s.end_date >= current_date)
        and (
            exists (
                select 1 from support_schedule ss
                where ss.support_id = s.id and ss.region_id = r.id
                  and ss.status = '접수중'
                  and (ss.apply_start is null or ss.apply_start <= now())
                  and (ss.apply_end is null or ss.apply_end >= now())
            )
            or not exists (
                select 1 from support_schedule ss
                where ss.support_id = s.id and ss.region_id = r.id
            )
        )
"""


# ── 환급 계산 (POST /api/support/calculate) ───────────
_POLICIES_FOR_CALC_SQL = f"""
with active_support as (
    -- 이 지역에 적용되면서 '지금 진행 중'인 제도만 추림.
    -- 목록·지도와 같은 조건을 써야 "목록엔 없는 제도가 환급액에 잡히는" 일이 없다.
    select distinct s.id, s.support_title, s.max_amount, s.is_pre_approval, s.apply_url
    from support s
    join support_region sr on sr.support_id = s.id
    join region r on r.id = sr.region_id
    where r.region_code = %(region_code)s
      and ({_ACTIVE_PREDICATE})
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
_SUPPORT_LIST_SQL = f"""
select distinct
    s.id,
    s.support_title as title,
    s.agency,
    s.summary,
    s.refund_type,
    s.max_amount,
    to_char(s.end_date, 'YYYY-MM-DD') as end_date
from support s
join support_region sr on sr.support_id = s.id
join region r on r.id = sr.region_id
where r.region_code = %(region_code)s
  and ({_ACTIVE_PREDICATE})
order by s.max_amount desc nulls last
"""


def get_support_list(conn, region_code: str) -> list[dict]:
    """지역에 적용되는 '진행 중' 지원 제도 목록"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(_SUPPORT_LIST_SQL, {"region_code": region_code})
        return cur.fetchall()


# ── 활성 지역 (GET /api/support/regions) ──────────────
# 지도에서 어느 지역을 색칠할지 정하는 데 쓴다.
#
# _SUPPORT_LIST_SQL과 사실상 같은 쿼리이고, 두 곳만 다르다.
#   - select : 제도 정보 대신 지역 코드를 뽑는다
#   - where  : region_code 필터가 없다 (한 지역이 아니라 전국을 대상으로 하므로)
# 즉 "이 지역에 제도가 뭐가 있나"를 "제도가 있는 지역이 어디인가"로 뒤집은 것이다.
# '진행 중' 판정은 _ACTIVE_PREDICATE 하나를 세 쿼리가 나눠 쓴다.
_ACTIVE_REGIONS_SQL = f"""
select distinct r.region_code
from support s
join support_region sr on sr.support_id = s.id
join region r on r.id = sr.region_id
where ({_ACTIVE_PREDICATE})
order by r.region_code
"""


def get_active_region_codes(conn) -> list[str]:
    """지금 신청 가능한 제도가 하나라도 있는 지역 코드"""
    with conn.cursor() as cur:
        cur.execute(_ACTIVE_REGIONS_SQL)
        return [row[0] for row in cur.fetchall()]


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