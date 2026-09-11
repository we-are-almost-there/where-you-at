"""GET /api/support/regions 라우터·쿼리 테스트 (unittest, DB 없이 crud 함수 patch).

지도 색칠 대상을 정하는 엔드포인트다. 검증 범위:
    - 라우트 순서: /regions가 /{id}보다 위에 선언돼 있는지 (아래면 id="regions"로 잡혀 422)
    - 활성 지역이 없을 때 200 + 빈 배열
    - 활성 지역이 있을 때 200 + 코드 배열
    - crud가 커서 행(튜플)을 문자열 리스트로 펴는지
    - 두 쿼리의 where 절이 공유 조건(_ACTIVE_PREDICATE)에서 벗어나지 않는지

마지막 항목이 이 파일의 핵심이다. 지도(_ACTIVE_REGIONS_SQL)와 목록(_SUPPORT_LIST_SQL)이
다른 기준을 쓰면 "지도는 색칠했는데 눌러보면 제도가 없어요"가 된다. 조건 자체는
_ACTIVE_PREDICATE 한 곳에서 공유하므로 갈라질 수 없고, 여기서는 where 절에 다른 조건이
덧붙지 않았는지를 전체 비교로 확인한다(부분 문자열 검사는 `and false`를 못 잡는다).

다루지 않는 것: 이 SQL이 Postgres에서 실제로 어떤 행을 고르는지.
    차수 status, start_date/end_date 경계, 오늘 날짜에 따른 결과는 DB를 띄워야 확인된다.
    지금은 그 환경이 없어 쿼리 텍스트 수준까지만 본다.

실행 (backend/ 에서):
    python -m unittest discover -s tests -t .
    python -m unittest tests.test_support_regions
"""
import os
import re
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.crud import support as support_crud
from app.deps import get_db
from app.main import app


def _override_get_db():
    # 라우터가 conn을 실제로 쓰지 않도록(crud를 patch하므로) 더미 객체만 흘려보낸다.
    yield MagicMock()


def _norm(sql: str) -> str:
    """들여쓰기·줄바꿈 차이를 무시하고 SQL 텍스트를 비교하기 위한 정규화"""
    return " ".join(sql.split())


def _where_clause(sql: str) -> str:
    """where와 order by 사이를 통째로 꺼낸다. 조건이 덧붙었는지 보려면 부분이 아니라 전체를 봐야 한다."""
    normalized = _norm(sql)
    start = normalized.index(" where ") + len(" where ")
    end = normalized.index(" order by ", start)
    return normalized[start:end].strip()


PREDICATE = _norm(support_crud._ACTIVE_PREDICATE)


class TestActiveRegionsQuery(unittest.TestCase):
    """쿼리 텍스트 자체에 대한 검증 — DB도 앱도 띄우지 않는다."""

    def test_all_three_queries_are_built_from_the_shared_predicate(self):
        # 문자열을 각자 들고 있으면 한쪽만 고쳐져 답이 갈린다.
        # 목록·지도뿐 아니라 환급 계산도 같은 기준을 써야, 목록엔 없는 제도가
        # 환급액에 잡히는 일이 없다.
        self.assertIn(PREDICATE, _norm(support_crud._SUPPORT_LIST_SQL))
        self.assertIn(PREDICATE, _norm(support_crud._ACTIVE_REGIONS_SQL))
        self.assertIn(PREDICATE, _norm(support_crud._POLICIES_FOR_CALC_SQL))

    def test_calc_query_has_no_private_copy_of_the_condition(self):
        # 예전에는 ss2/ss3 별칭으로 같은 조건을 따로 들고 있었다.
        sql = support_crud._POLICIES_FOR_CALC_SQL
        self.assertNotIn("ss2", sql)
        self.assertNotIn("ss3", sql)

    def test_active_regions_where_clause_is_exactly_the_predicate(self):
        # 부분 문자열만 보면 `... and false`처럼 조건이 덧붙어도 통과한다.
        # where 절 전체가 공유 조건 하나여야 한다.
        self.assertEqual(_where_clause(support_crud._ACTIVE_REGIONS_SQL), f"( {PREDICATE} )")

    def test_list_where_clause_is_region_filter_plus_the_predicate(self):
        # 목록 쪽은 지역 필터 하나만 더 붙는다. 그 외 조건이 늘면 두 답이 갈린다.
        self.assertEqual(
            _where_clause(support_crud._SUPPORT_LIST_SQL),
            f"r.region_code = %(region_code)s and ( {PREDICATE} )",
        )

    def test_active_regions_query_has_no_region_filter(self):
        # 전국을 대상으로 하므로 지역 필터가 있으면 안 된다
        self.assertNotIn("region_code)s", support_crud._ACTIVE_REGIONS_SQL)

    def test_predicate_checks_dates_not_only_schedule_status(self):
        # status만 보면 상태 갱신이 누락된 지난 차수가 계속 '접수중'으로 남아
        # 만료된 지역이 활성으로 보인다. 제도 기간과 신청 기간을 함께 봐야 한다.
        predicate = support_crud._ACTIVE_PREDICATE
        for column in ("s.start_date", "s.end_date", "ss.apply_start", "ss.apply_end"):
            self.assertIn(
                column,
                predicate,
                f"{column} 검사가 빠지면 상태와 기간이 어긋난 지역이 활성으로 남는다",
            )

    def test_predicate_compares_dates_in_seoul_time(self):
        # current_date로 되돌리면 세션 타임존(Supabase는 UTC)을 따라
        # 한국 시간 00~09시에 날짜가 하루 어긋난다.
        self.assertIn("at time zone 'Asia/Seoul'", support_crud._ACTIVE_PREDICATE)
        self.assertNotIn("current_date", support_crud._ACTIVE_PREDICATE)

    def test_predicate_closes_pre_approval_rounds_at_travel_end(self):
        # 제도 종료일이 없는 사전 신청 제도를 닫는 건 차수의 여행 종료일뿐이다
        for token in ("ss.travel_end", "s.is_pre_approval"):
            self.assertIn(token, support_crud._ACTIVE_PREDICATE)

    def test_predicate_opens_scheduled_rounds_by_date_not_only_status(self):
        # '접수중'만 보면 시작일이 지나도 사람이 status를 고치기 전까지 회색으로 남는다
        self.assertIn("'준비중'", support_crud._ACTIVE_PREDICATE)
        self.assertIn("ss.apply_start", support_crud._ACTIVE_PREDICATE)

        # '준비중'을 여는 분기를 통째로 고정한다.
        #
        # 두 조건은 null에 대해 서로 중복이다 — 시작 시각이 없는 자리표 차수는
        # 'is not null'에도 걸리고, SQL 3치 논리상 'null <= now()'가 NULL이라
        # 비교에도 걸린다. 그래서 하나만 지우면 동작이 그대로고, 토큰을 하나씩
        # 보는 검사로는 둘 다 사라진 경우를 잡을 수 없다. 실제로 둘을 함께 지우면
        # 시드의 자리표 4행(장흥·태안·영천·함양 2차)이 열린다.
        #
        # DB 검사(test_scheduled_round_without_a_start_time_never_opens)의 값싼 짝이다.
        # 그쪽은 RUN_DB_TESTS=1이 있어야 돌지만 이 검사는 항상 돈다.
        self.assertIn(
            "(ss.status = '준비중'"
            " and ss.apply_start is not null"
            " and ss.apply_start <= now())",
            _norm(support_crud._ACTIVE_PREDICATE),
        )

    def test_no_schedule_fallback_is_per_support_not_per_region(self):
        # 지역 단위로 보면 일정 입력이 빠진 지역이 '차수 없는 제도'로 새어
        # 제도 기간만으로 켜진다. 반값여행은 end_date가 null이라 곧 무기한 활성이다.
        # DB 검사(test_region_without_a_round_is_inactive_when_the_support_has_rounds)의
        # 값싼 짝 — 그쪽은 RUN_DB_TESTS=1이 있어야 돈다.
        self.assertIn(
            "or not exists ( select 1 from support_schedule ss where ss.support_id = s.id )",
            _norm(support_crud._ACTIVE_PREDICATE),
        )

    def test_predicate_never_opens_closed_rounds(self):
        # '마감'은 기간이 남아도 닫힌 것이다. 상태를 나열해 두면 새 상태값이
        # 생겨도 저절로 열리지 않는다 — '마감'이 여는 쪽 목록에 없어야 한다.
        opened = re.findall(r"ss\.status = '([^']+)'", support_crud._ACTIVE_PREDICATE)
        self.assertNotIn("마감", opened)
        self.assertEqual(set(opened), {"접수중", "준비중"})

    def test_apply_window_columns_follow_the_status_check(self):
        # 텍스트 순서만 본다. 두 조건이 정말 같은 exists 안에서 같은 차수를 보는지는
        # 이 검사로 증명되지 않는다 — 별도 exists로 나눠도 순서만 맞으면 통과한다.
        # 그 회귀는 TestActivePredicateBoundaries의
        # test_open_and_in_window_must_be_the_same_round가 DB에서 잡는다.
        normalized = _norm(support_crud._ACTIVE_PREDICATE)
        start = normalized.index("ss.status = '접수중'")
        end = normalized.index(")", normalized.index("ss.apply_end"))
        between = normalized[start:end]
        self.assertIn("ss.apply_start", between)
        self.assertIn("ss.apply_end", between)

    def test_crud_flattens_cursor_rows_to_codes(self):
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        cur.fetchall.return_value = [("12780",), ("43760",)]

        self.assertEqual(support_crud.get_active_region_codes(conn), ["12780", "43760"])
        cur.execute.assert_called_once_with(support_crud._ACTIVE_REGIONS_SQL)


class TestGetActiveRegions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = _override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(get_db, None)

    @patch("app.api.routers.support.crud.get_active_region_codes", return_value=[])
    def test_no_active_region_returns_empty_list(self, mock_codes):
        # 모든 제도가 끝난 상태. 지도가 전부 회색이 되는 정상 경로이며 500이 아니다.
        res = self.client.get("/api/support/regions")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), [])
        mock_codes.assert_called_once()

    @patch(
        "app.api.routers.support.crud.get_active_region_codes",
        return_value=["12780", "28720", "43760"],
    )
    def test_returns_active_region_codes(self, mock_codes):
        res = self.client.get("/api/support/regions")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), ["12780", "28720", "43760"])

    @patch("app.api.routers.support.crud.get_active_region_codes", return_value=[])
    def test_regions_is_not_captured_by_the_id_route(self, mock_codes):
        # /{id}가 위에 있으면 id="regions"로 파싱돼 422가 난다.
        # 라우터 선언 순서를 되돌리면 이 테스트가 깨진다.
        res = self.client.get("/api/support/regions")
        self.assertNotEqual(res.status_code, 422)
        mock_codes.assert_called_once()


@unittest.skipUnless(
    os.getenv("RUN_DB_TESTS"),
    "실제 DB가 필요한 테스트. RUN_DB_TESTS=1 로 실행한다.",
)
class TestActiveRegionsAgainstDatabase(unittest.TestCase):
    """쿼리가 실제 Postgres에서 의도한 행을 고르는지 본다. 읽기만 한다.

    쿼리 텍스트 검사는 조건이 갈라지는 것만 막을 뿐, 조건이 실제로 맞는지는 못 본다.
    차수 상태와 날짜가 어긋난 경우가 여기서 걸린다.

    실행 (backend/ 에서, .env의 DB 접속 정보 필요):
        RUN_DB_TESTS=1 python -m unittest tests.test_support_regions
    """

    @classmethod
    def setUpClass(cls):
        from app.db.supabase import get_db_connection

        cls.conn = get_db_connection()
        if cls.conn is None:
            raise unittest.SkipTest("DB에 연결할 수 없다")

    @classmethod
    def tearDownClass(cls):
        if getattr(cls, "conn", None):
            cls.conn.close()

    def test_map_and_list_agree_for_every_region(self):
        """지도가 색칠하는 지역 == 목록이 비어 있지 않은 지역 (전 지역 대조)"""
        active = set(support_crud.get_active_region_codes(self.conn))
        with self.conn.cursor() as cur:
            cur.execute("select region_code from region order by region_code")
            all_codes = [row[0] for row in cur.fetchall()]

        has_list = {c for c in all_codes if support_crud.get_support_list(self.conn, c)}

        self.assertEqual(
            sorted(active - has_list), [], "지도는 색칠하는데 목록이 비어 있는 지역"
        )
        self.assertEqual(
            sorted(has_list - active), [], "제도가 있는데 지도에서 회색인 지역"
        )

    def test_expired_support_is_excluded_even_with_open_schedule(self):
        """제도 종료일이 지났으면 '접수중' 차수가 남아 있어도 제외된다.

        status는 공지 시점의 스냅샷이라 사람이 갱신하지 않으면 지난 차수에 그대로
        남는다. 제도 기간이 끝났는데 그런 차수가 있으면 status만 보는 판정은 계속
        활성으로 잡는다.

        지금 시드에는 그런 조합이 없어(반값여행은 end_date가 null이고 지난 차수는
        전부 '마감'으로 갱신돼 있다) 이 검사는 건너뛴다. 데이터가 다시 그 모양이
        되면 그때 실제로 검사한다.
        """
        with self.conn.cursor() as cur:
            cur.execute(
                """
                select distinct s.support_title, r.region_code
                from support s
                join support_schedule ss on ss.support_id = s.id
                join region r on r.id = ss.region_id
                where ss.status = '접수중'
                  and s.end_date is not null and s.end_date < current_date
                """
            )
            stale = cur.fetchall()

        if not stale:
            self.skipTest("종료일이 지났는데 '접수중'인 차수가 없다")

        for title, region_code in stale:
            titles = [r["title"] for r in support_crud.get_support_list(self.conn, region_code)]
            self.assertNotIn(
                title,
                titles,
                f"{region_code}: 종료된 '{title}'이 차수 상태 때문에 목록에 남아 있다",
            )


@unittest.skipUnless(
    os.getenv("RUN_DB_TESTS"),
    "실제 DB가 필요한 테스트. RUN_DB_TESTS=1 로 실행한다.",
)
class TestActivePredicateBoundaries(unittest.TestCase):
    """신청 기간 경계를 고정 데이터로 검증한다.

    기존 데이터로는 확인이 안 되는 조합이 있다. 시드의 반값여행은 제도 자체가 이미
    만료라, apply_start/apply_end 검사를 지워도 제도 기간 조건에 걸려 여전히 제외된다.
    즉 신청 기간 검사가 실제로 일하는지 드러나지 않는다.
    그래서 '제도는 운영 중인데 차수만 어긋난' 경우를 직접 만들어 본다.

    테스트 데이터는 트랜잭션 안에서만 만들고 addCleanup으로 예약해 둔 정리에서
    되돌린다(연결을 열자마자 예약해, 준비 중에 skipTest로 빠져나가도 닫힌다). 커밋하지 않으므로
    DB에 남지 않는다(identity 시퀀스 번호만 소모된다).

    실행 (backend/ 에서):
        RUN_DB_TESTS=1 python -m unittest tests.test_support_regions
    """

    # 지원 제도가 걸려 있지 않은 지역이어야 다른 제도가 섞이지 않는다
    REGION_CODE = "11110"  # 서울 종로구
    # 같은 제도를 두 지역에 걸어 "한쪽만 일정이 있는" 경우를 만들 때 쓴다
    OTHER_REGION_CODE = "11140"  # 서울 중구

    @classmethod
    def setUpClass(cls):
        from app.db.supabase import get_db_connection

        cls._connect = staticmethod(get_db_connection)

    def setUp(self):
        self.conn = self._connect()
        if self.conn is None:
            self.skipTest("DB에 연결할 수 없다")
        # 아래에서 skipTest가 걸리면 tearDown이 돌지 않아 연결이 남는다.
        # 여는 즉시 정리를 예약해 두면 준비 중에 빠져나가도 닫힌다.
        self.addCleanup(self._cleanup)
        self.conn.autocommit = False
        with self.conn.cursor() as cur:
            cur.execute(
                "select id from region where region_code = %s", (self.REGION_CODE,)
            )
            row = cur.fetchone()
            if row is None:
                self.skipTest(f"{self.REGION_CODE} 지역이 없다")
            self.region_id = row[0]
            # 이 지역에 이미 제도가 걸려 있으면 결과가 섞인다
            if support_crud.get_support_list(self.conn, self.REGION_CODE):
                self.skipTest(f"{self.REGION_CODE}에 이미 제도가 있어 기준으로 쓸 수 없다")
            if support_crud.get_support_list(self.conn, self.OTHER_REGION_CODE):
                self.skipTest(f"{self.OTHER_REGION_CODE}에 이미 제도가 있어 기준으로 쓸 수 없다")

    def _cleanup(self):
        # 커밋하지 않는다. 만든 행은 전부 사라진다.
        try:
            self.conn.rollback()
        finally:
            self.conn.close()

    def _make_support(
        self,
        *,
        start_offset_days: int | None,
        end_offset_days: int | None,
        pre_approval: bool = False,
    ) -> int:
        """제도 하나를 만들어 대상 지역에 건다. 기간은 오늘 기준 상대일수(None이면 무기한)."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                insert into support
                    (support_title, support_type, refund_type,
                     start_date, end_date, is_pre_approval)
                values
                    (%s, '테스트', '없음',
                     case when %s is null then null else current_date + %s::integer end,
                     case when %s is null then null else current_date + %s::integer end,
                     %s)
                returning id
                """,
                (
                    "__경계 테스트 제도__",
                    start_offset_days, start_offset_days,
                    end_offset_days, end_offset_days,
                    pre_approval,
                ),
            )
            support_id = cur.fetchone()[0]
            cur.execute(
                "insert into support_region (support_id, region_id) values (%s, %s)",
                (support_id, self.region_id),
            )
        return support_id

    def _add_schedule(
        self,
        support_id: int,
        *,
        status: str,
        apply_start,
        apply_end,
        round_no: int = 1,
        travel_end_offset_days: int | None = None,
    ):
        """차수를 붙인다. apply_start/apply_end는 now() 기준 interval 문자열 또는 None."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                insert into support_schedule
                    (support_id, region_id, apply_round, apply_start, apply_end,
                     travel_end, status)
                values
                    (%s, %s, %s,
                     case when %s is null then null else now() + %s::interval end,
                     case when %s is null then null else now() + %s::interval end,
                     case when %s is null then null else current_date + %s::integer end,
                     %s)
                """,
                (
                    support_id, self.region_id, round_no,
                    apply_start, apply_start,
                    apply_end, apply_end,
                    travel_end_offset_days, travel_end_offset_days,
                    status,
                ),
            )

    def _map_region(self, support_id: int, region_code: str):
        """같은 제도를 다른 지역에도 건다. 차수는 붙이지 않는다."""
        with self.conn.cursor() as cur:
            cur.execute("select id from region where region_code = %s", (region_code,))
            row = cur.fetchone()
            if row is None:
                self.skipTest(f"{region_code} 지역이 없다")
            cur.execute(
                "insert into support_region (support_id, region_id) values (%s, %s)",
                (support_id, row[0]),
            )

    def _is_active(self, region_code: str | None = None) -> bool:
        code = region_code or self.REGION_CODE
        titles = [r["title"] for r in support_crud.get_support_list(self.conn, code)]
        in_map = code in support_crud.get_active_region_codes(self.conn)
        # 목록과 지도가 갈리면 그 자체가 회귀다
        self.assertEqual(
            bool(titles), in_map, "목록과 지도가 같은 지역에 다른 답을 냈다"
        )
        return bool(titles)

    def test_no_schedule_and_support_period_open_is_active(self):
        self._make_support(start_offset_days=-10, end_offset_days=10)
        self.assertTrue(self._is_active())

    def test_region_without_a_round_is_inactive_when_the_support_has_rounds(self):
        """차수로 굴러가는 제도에서 일정이 안 들어간 지역은 꺼져 있어야 한다.

        '차수 없는 제도는 제도 기간만 본다'는 예외를 지역 단위로 판정하면, 일정
        입력이 빠진 지역이 그 예외로 새어 제도 기간만으로 켜진다. 반값여행처럼
        end_date가 null이면 그게 곧 무기한 활성이라, 시드에 한 줄 빠뜨린 것이
        조용히 상시 색칠로 바뀐다.
        """
        sid = self._make_support(start_offset_days=-10, end_offset_days=None)
        self._add_schedule(sid, status="접수중", apply_start="-1 day", apply_end="5 days")
        self._map_region(sid, self.OTHER_REGION_CODE)

        self.assertTrue(self._is_active(), "일정이 있는 지역은 열려 있어야 한다")
        self.assertFalse(
            self._is_active(self.OTHER_REGION_CODE),
            "신청할 차수가 없는 지역이 제도 기간만으로 켜졌다",
        )

    # ── '준비중' 차수를 날짜로 여는 부분 ──
    # 이 PR의 핵심 동작이다. 공지 시점에 '준비중'으로 적힌 차수는 시작일이 지나도
    # 아무도 상태를 고쳐 주지 않으므로, 날짜로 열지 않으면 지도가 계속 회색이다.
    # 텍스트 검사만으로는 '언제 열리는가'를 증명할 수 없어 여기서 실제로 돌려 본다.

    def test_scheduled_round_opens_once_its_start_time_passes(self):
        sid = self._make_support(start_offset_days=-10, end_offset_days=10)
        self._add_schedule(sid, status="준비중", apply_start="-1 day", apply_end=None)
        self.assertTrue(self._is_active())

    def test_scheduled_round_stays_closed_before_its_start_time(self):
        sid = self._make_support(start_offset_days=-10, end_offset_days=10)
        self._add_schedule(sid, status="준비중", apply_start="1 day", apply_end=None)
        self.assertFalse(self._is_active())

    def test_scheduled_round_without_a_start_time_never_opens(self):
        """일정이 아직 안 나온 자리표는 열리지 않는다.

        시드의 태안 2차가 이 경우다 — 여행 기간만 공지되고 '신청 접수일 추후 공지'라
        신청 날짜가 없다. 이 차수를 열어 버리면 '날짜로 판단한다'는 전제가 무너지고,
        신청할 수 없는 지역이 색칠된다.
        """
        sid = self._make_support(start_offset_days=-10, end_offset_days=10)
        self._add_schedule(sid, status="준비중", apply_start=None, apply_end=None)
        self.assertFalse(self._is_active())

    def test_pre_approval_round_ends_with_its_travel_period(self):
        """제도 기간도 신청 마감도 없는 사전 신청 차수는 여행 기간이 끝나면 비활성.

        반값여행이 이 모양이다 — 공지에 제도 전체 기간이 없어 end_date가 null이고,
        신청 마감이 안 적힌 차수가 많아 apply_end도 null이다. 여행 기간을 안 보면
        그 차수가 영원히 활성으로 남는다(실제로 2027년에도 활성이었다).
        """
        sid = self._make_support(
            start_offset_days=None, end_offset_days=None, pre_approval=True
        )
        self._add_schedule(
            sid, status="접수중", apply_start="-30 days", apply_end=None,
            travel_end_offset_days=-1,
        )
        self.assertFalse(self._is_active())

    def test_pre_approval_round_is_active_while_travel_period_remains(self):
        sid = self._make_support(
            start_offset_days=None, end_offset_days=None, pre_approval=True
        )
        self._add_schedule(
            sid, status="접수중", apply_start="-30 days", apply_end=None,
            travel_end_offset_days=1,
        )
        self.assertTrue(self._is_active())

    def test_pre_approval_round_without_a_travel_end_never_opens(self):
        # 여행 종료일이 그 차수를 닫는 유일한 조건이다. 비어 있으면 닫을 방법이
        # 없으므로 열지 않는다 — 날짜 미정 '준비중'과 같은 기준(모르면 닫는다).
        sid = self._make_support(
            start_offset_days=None, end_offset_days=None, pre_approval=True
        )
        self._add_schedule(
            sid, status="접수중", apply_start="-30 days", apply_end=None,
            travel_end_offset_days=None,
        )
        self.assertFalse(self._is_active())

    def test_post_travel_application_ignores_the_travel_period(self):
        # 여행 후 신청하는 제도(is_pre_approval = false)까지 함께 끊으면 안 된다
        sid = self._make_support(
            start_offset_days=None, end_offset_days=None, pre_approval=False
        )
        self._add_schedule(
            sid, status="접수중", apply_start="-30 days", apply_end=None,
            travel_end_offset_days=-1,
        )
        self.assertTrue(self._is_active())

    def test_open_and_in_window_must_be_the_same_round(self):
        """'접수중'인 차수와 신청 기간 안인 차수가 서로 다르면 활성이 아니다.

        1차: 접수중인데 신청 기간이 이미 끝남
        2차: 신청 기간 안이지만 마감

        활성일 수 있는 차수가 하나도 없다. 상태와 기간을 각각 다른 exists로 나누면
        1차의 상태와 2차의 기간을 합쳐 활성으로 판단하는데, 그 회귀를 여기서 잡는다.
        쿼리 텍스트 검사로는 이 구분을 증명할 수 없다.
        """
        sid = self._make_support(start_offset_days=-10, end_offset_days=10)
        self._add_schedule(
            sid, status="접수중", apply_start="-5 days", apply_end="-1 day", round_no=1
        )
        self._add_schedule(
            sid, status="마감", apply_start="-1 day", apply_end="5 days", round_no=2
        )
        self.assertFalse(self._is_active())

    def test_schedule_open_but_apply_window_not_started_is_inactive(self):
        # 제도는 운영 중인데 신청은 아직 시작 전
        sid = self._make_support(start_offset_days=-10, end_offset_days=10)
        self._add_schedule(sid, status="접수중", apply_start="1 day", apply_end="5 days")
        self.assertFalse(self._is_active())

    def test_schedule_open_but_apply_window_already_ended_is_inactive(self):
        # 제도는 운영 중인데 신청 기간이 끝났고 상태 갱신이 누락된 경우
        sid = self._make_support(start_offset_days=-10, end_offset_days=10)
        self._add_schedule(sid, status="접수중", apply_start="-5 days", apply_end="-1 day")
        self.assertFalse(self._is_active())

    def test_apply_window_is_inclusive_at_both_edges(self):
        # 경계 시각과 정확히 같은 순간은 신청 가능해야 한다 (<=, >=)
        sid = self._make_support(start_offset_days=-10, end_offset_days=10)
        self._add_schedule(sid, status="접수중", apply_start="0 seconds", apply_end="0 seconds")
        self.assertTrue(self._is_active())

    def test_closed_status_is_inactive_even_inside_apply_window(self):
        # 조기 마감. 기간은 남았지만 상태가 마감이면 제외돼야 한다
        sid = self._make_support(start_offset_days=-10, end_offset_days=10)
        self._add_schedule(sid, status="마감", apply_start="-1 day", apply_end="5 days")
        self.assertFalse(self._is_active())

    def test_open_schedule_inside_window_is_active(self):
        # 정상 경로 — 위 케이스들이 조건 전체를 꺼버려서 통과하는 게 아님을 보인다
        sid = self._make_support(start_offset_days=-10, end_offset_days=10)
        self._add_schedule(sid, status="접수중", apply_start="-1 day", apply_end="5 days")
        self.assertTrue(self._is_active())

    def test_support_period_ended_is_inactive_even_with_open_schedule(self):
        # 제도가 끝났으면 차수가 열려 있어도 제외 (시드의 반값여행이 이 경우)
        sid = self._make_support(start_offset_days=-30, end_offset_days=-1)
        self._add_schedule(sid, status="접수중", apply_start="-1 day", apply_end="5 days")
        self.assertFalse(self._is_active())


if __name__ == "__main__":
    unittest.main()
