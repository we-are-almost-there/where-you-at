from psycopg2.extras import RealDictCursor


# ── '진행 중' 판정 ────────────────────────────────────
# 목록(GET /api/support)·지도(GET /api/support/regions)·환급 계산이 모두 같은 기준을
# 써야 한다. 다르면 "지도는 색칠했는데 제도가 없어요"거나 "목록엔 없는데 환급은 계산된다"가
# 된다. 주석으로 "같게 유지할 것"이라고만 두면 언젠가 한쪽만 고쳐지므로, 한 곳에 두고
# 세 쿼리가 끼워 넣어 갈라질 수 없게 한다.
#
# 제도 기간이 열려 있는 것을 공통 전제로 두고, 그 안에서
#   1) 차수가 있는 제도는 신청 기간 안이어야 하고
#   2) 차수가 없는 제도는 제도 기간만으로 판단한다
#
# 판정의 1차 기준은 날짜다. status는 그 위에 얹는 신호로만 쓴다. status만 보면
# 양쪽으로 틀린다 — 지난 차수가 '접수중'으로 남아 있으면 만료된 지역이 켜진 채로 남고,
# 시작일이 지난 차수가 '준비중'으로 남아 있으면 열려야 할 지역이 회색으로 남는다.
# 둘 다 사람이 status를 손으로 갱신해야만 풀리는데, 그건 이 기능의 전제가 아니다.
#
# 반값여행처럼 제도 종료일이 공지되지 않는 제도(end_date null)는 차수의 여행 기간이
# 닫는다. 그게 없으면 신청 마감도 없는 차수가 영원히 활성으로 남는다.
#
# 쓰는 쪽은 support를 s, region을 r로 별칭해야 한다.
#
# 날짜 비교는 한국 날짜로 한다. current_date는 DB 세션 타임존을 따르는데 Supabase가
# UTC라, 한국 시간 9월 11일 0시에도 current_date는 9월 10일이다. 그대로 두면 종료된
# 제도가 다음 날 오전 9시까지 살아 있고, 시작일 제도는 오전 9시에야 열린다.
# apply_start·apply_end는 시각까지 있는 timestamptz라 now()와 그대로 비교하면 된다.
_TODAY_KST = "(now() at time zone 'Asia/Seoul')::date"

_ACTIVE_PREDICATE = f"""
        (s.start_date is null or s.start_date <= {_TODAY_KST})
        and (s.end_date is null or s.end_date >= {_TODAY_KST})
        and (
            exists (
                select 1 from support_schedule ss
                where ss.support_id = s.id and ss.region_id = r.id
                  -- 신청 가능 여부는 날짜가 정한다. status는 그 위에 얹는 신호다.
                  --   마감   : 기간이 남아도 닫힘(예산 소진 등 조기 마감) — 항상 제외
                  --   접수중 : 공지가 열렸다고 명시. 시작 시각이 안 적혔어도 연다
                  --   준비중 : 공지 시점의 스냅샷일 뿐이다. 시작일이 지났으면 실제로는
                  --            열려 있으므로 함께 본다. 이게 없으면 사람이 status를
                  --            손으로 고치기 전까지 지도가 계속 회색이다.
                  -- 상태를 나열해 두면 새 상태값이 생겨도 저절로 열리지 않는다.
                  --
                  -- '준비중'의 apply_start 비교는 바로 아래 줄과 겹친다. 일부러 남긴다 —
                  -- 이 괄호만 떼어 읽어도 "어떤 상태를 여는가"가 그 자체로 말이 되어야
                  -- 하고, 아래 줄은 apply_start가 null이면 통과시키므로 여기서 빼면
                  -- 시작 시각 없는 '준비중'까지 열린다.
                  and (
                        ss.status = '접수중'
                     or (ss.status = '준비중'
                         and ss.apply_start is not null
                         and ss.apply_start <= now())
                  )
                  and (ss.apply_start is null or ss.apply_start <= now())
                  and (ss.apply_end is null or ss.apply_end >= now())
                  -- 사전 신청 제도는 그 차수의 여행 기간이 끝나면 더 신청할 수 없다.
                  -- 공지에 신청 마감이 안 적힌 차수가 많아 apply_end가 null인데,
                  -- 이 조건이 없으면 제도 종료일도 없는 반값여행이 무기한 활성으로 남는다.
                  -- 여행 후 신청하는 제도(is_pre_approval = false)에는 적용하지 않는다.
                  --
                  -- 주의: is_pre_approval은 원래 환급 계산 UI용 플래그다(_POLICIES_FOR_CALC_SQL이
                  -- 프런트로 내려보낸다). 여기서 활성 판정까지 겸하므로, UI 사정으로 이 값을
                  -- 뒤집으면 지도 색칠도 함께 바뀐다.
                  --
                  -- travel_end가 비어 있으면 닫는다. 여기만 열어 두면(or travel_end is
                  -- null) 닫을 방법이 없는 차수가 무기한 활성으로 남는다 — 날짜 미정
                  -- '준비중'을 안 여는 것과 같은 기준이다. 모르면 닫는다.
                  -- null 비교가 NULL을 내므로 조건을 빼는 것만으로 닫힌다.
                  and (
                        not s.is_pre_approval
                        or ss.travel_end >= {_TODAY_KST}
                  )
            )
            -- 차수 자체가 없는 제도(관광주민증·숙박세일)는 제도 기간만으로 판단한다.
            --
            -- 제도 단위로 본다. region_id까지 걸어 지역 단위로 보면, 차수로 굴러가는
            -- 제도에서 어느 한 지역의 일정만 입력이 빠졌을 때 그 지역이 "차수 없는
            -- 제도"로 둔갑해 제도 기간만으로 켜진다. 반값여행은 end_date가 null이라
            -- 그게 곧 무기한 활성이다 — 입력 누락이 조용히 상시 색칠로 바뀐다.
            -- 제도 단위면 그 지역은 그냥 꺼진다. 신청할 차수가 없으니 그게 맞다.
            or not exists (
                select 1 from support_schedule ss
                where ss.support_id = s.id
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