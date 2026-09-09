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

    def test_both_queries_are_built_from_the_shared_predicate(self):
        # 문자열을 각자 들고 있으면 한쪽만 고쳐져 지도와 목록이 어긋난다.
        # 한 상수를 끼워 넣는 구조를 유지하는지 본다.
        self.assertIn(PREDICATE, _norm(support_crud._SUPPORT_LIST_SQL))
        self.assertIn(PREDICATE, _norm(support_crud._ACTIVE_REGIONS_SQL))

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


if __name__ == "__main__":
    unittest.main()
