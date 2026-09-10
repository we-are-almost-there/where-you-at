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

    def test_schedule_status_is_paired_with_the_apply_window(self):
        # '접수중' 조건과 신청 기간 조건이 같은 exists 안에 있어야 한다.
        # 밖으로 나가면 다른 차수의 기간으로 통과해 버린다.
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

        시드의 반값여행이 이 경우다. 종료일(2026-08-31)이 지났는데 영광·해남·거창의
        차수가 '접수중'으로 남아 있어, status만 보면 계속 활성으로 잡힌다.
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

    테스트 데이터는 트랜잭션 안에서만 만들고 tearDown에서 되돌린다. 커밋하지 않으므로
    DB에 남지 않는다(identity 시퀀스 번호만 소모된다).

    실행 (backend/ 에서):
        RUN_DB_TESTS=1 python -m unittest tests.test_support_regions
    """

    # 지원 제도가 걸려 있지 않은 지역이어야 다른 제도가 섞이지 않는다
    REGION_CODE = "11110"  # 서울 종로구

    @classmethod
    def setUpClass(cls):
        from app.db.supabase import get_db_connection

        cls._connect = staticmethod(get_db_connection)

    def setUp(self):
        self.conn = self._connect()
        if self.conn is None:
            self.skipTest("DB에 연결할 수 없다")
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

    def tearDown(self):
        # 커밋하지 않는다. 만든 행은 전부 사라진다.
        self.conn.rollback()
        self.conn.close()

    def _make_support(self, *, start_offset_days: int, end_offset_days: int) -> int:
        """제도 하나를 만들어 대상 지역에 건다. 기간은 오늘 기준 상대일수."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                insert into support
                    (support_title, support_type, refund_type, start_date, end_date)
                values
                    (%s, '테스트', '없음',
                     current_date + %s, current_date + %s)
                returning id
                """,
                ("__경계 테스트 제도__", start_offset_days, end_offset_days),
            )
            support_id = cur.fetchone()[0]
            cur.execute(
                "insert into support_region (support_id, region_id) values (%s, %s)",
                (support_id, self.region_id),
            )
        return support_id

    def _add_schedule(self, support_id: int, *, status: str, apply_start, apply_end):
        """차수를 붙인다. apply_start/apply_end는 now() 기준 interval 문자열 또는 None."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                insert into support_schedule
                    (support_id, region_id, apply_round, apply_start, apply_end, status)
                values
                    (%s, %s, 1,
                     case when %s is null then null else now() + %s::interval end,
                     case when %s is null then null else now() + %s::interval end,
                     %s)
                """,
                (
                    support_id, self.region_id,
                    apply_start, apply_start,
                    apply_end, apply_end,
                    status,
                ),
            )

    def _is_active(self) -> bool:
        titles = [r["title"] for r in support_crud.get_support_list(self.conn, self.REGION_CODE)]
        in_map = self.REGION_CODE in support_crud.get_active_region_codes(self.conn)
        # 목록과 지도가 갈리면 그 자체가 회귀다
        self.assertEqual(
            bool(titles), in_map, "목록과 지도가 같은 지역에 다른 답을 냈다"
        )
        return bool(titles)

    def test_no_schedule_and_support_period_open_is_active(self):
        self._make_support(start_offset_days=-10, end_offset_days=10)
        self.assertTrue(self._is_active())

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
