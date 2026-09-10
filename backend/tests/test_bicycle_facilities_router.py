"""자전거 대여소 라우터(GET /api/bicycle-facilities 등) HTTP 레벨 테스트.

DB 없이 crud 함수를 patch해서, 요청 파라미터가 crud 함수에 올바르게
전달되고 응답이 기대한 스키마로 나오는지 검증한다.

실행: backend/ 에서  python -m unittest discover -s tests
"""
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.deps import get_db


def _override_get_db():
    yield MagicMock()


class TestListFacilitiesEndpoint(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = _override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(get_db, None)

    @patch(
        "app.api.routers.bicycle_facilities.list_bicycle_facilities",
        return_value=(0, []),
    )
    def test_empty_result_returns_200_with_zero_total(self, mock_list):
        res = self.client.get("/api/bicycle-facilities")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["total_count"], 0)
        self.assertEqual(body["facilities"], [])

    @patch("app.api.routers.bicycle_facilities.list_bicycle_facilities")
    def test_query_params_forwarded_to_crud(self, mock_list):
        mock_list.return_value = (0, [])
        self.client.get(
            "/api/bicycle-facilities",
            params={
                "region": "11",
                "facility_type": "rental_unmanned",
                "fee_type": "유료",
                "data_source": "standard",
                "page": 2,
                "size": 10,
            },
        )
        mock_list.assert_called_once()
        _, kwargs = mock_list.call_args
        self.assertEqual(kwargs["region"], "11")
        self.assertEqual(kwargs["facility_type"], "rental_unmanned")
        self.assertEqual(kwargs["fee_type"], "유료")
        self.assertEqual(kwargs["data_source"], "standard")
        self.assertEqual(kwargs["page"], 2)
        self.assertEqual(kwargs["size"], 10)

    def test_invalid_region_pattern_returns_422(self):
        # region은 2자리 또는 2+2~3자리(4~5자리)만 허용. 3자리는 패턴 불일치.
        res = self.client.get("/api/bicycle-facilities", params={"region": "111"})
        self.assertEqual(res.status_code, 422)

    def test_invalid_fee_type_returns_422(self):
        # "혼합"은 더 이상 쿼리 파라미터로 직접 받지 않는다(유료에 자동 포함).
        res = self.client.get("/api/bicycle-facilities", params={"fee_type": "혼합"})
        self.assertEqual(res.status_code, 422)

    def test_invalid_facility_type_returns_422(self):
        res = self.client.get("/api/bicycle-facilities", params={"facility_type": "rental_unmaned"})
        self.assertEqual(res.status_code, 422)

    def test_invalid_data_source_returns_422(self):
        res = self.client.get("/api/bicycle-facilities", params={"data_source": "unknown"})
        self.assertEqual(res.status_code, 422)


class TestGetRegionsEndpoint(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = _override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(get_db, None)

    @patch(
        "app.api.routers.bicycle_facilities.list_bicycle_regions",
        return_value=[{"region_code": "11", "name": "서울특별시", "sido": "서울특별시"}],
    )
    def test_regions_returns_list(self, mock_list):
        res = self.client.get("/api/bicycle-facilities/regions")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]["sido"], "서울특별시")

    @patch("app.api.routers.bicycle_facilities.list_bicycle_regions")
    def test_regions_forwards_data_source(self, mock_list):
        mock_list.return_value = []
        self.client.get("/api/bicycle-facilities/regions", params={"data_source": "realtime"})
        _, kwargs = mock_list.call_args
        self.assertEqual(kwargs["data_source"], "realtime")


class TestGetSubregionsEndpoint(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = _override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(get_db, None)

    @patch(
        "app.api.routers.bicycle_facilities.list_bicycle_subregions",
        return_value=[{"region_code": "11110", "name": "종로구", "cnt": 3}],
    )
    def test_subregions_returns_list(self, mock_list):
        res = self.client.get("/api/bicycle-facilities/regions/11/subregions")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body[0]["name"], "종로구")
        self.assertEqual(body[0]["cnt"], 3)

    @patch("app.api.routers.bicycle_facilities.list_bicycle_subregions")
    def test_subregions_parent_code_and_data_source_forwarded(self, mock_list):
        mock_list.return_value = []
        self.client.get(
            "/api/bicycle-facilities/regions/4111/subregions",
            params={"data_source": "standard"},
        )
        args, kwargs = mock_list.call_args
        self.assertEqual(args[1], "4111")  # parent_code
        self.assertEqual(kwargs["data_source"], "standard")

    def test_subregions_route_not_shadowed_by_id_route(self):
        # "/regions/{parent_code}/subregions"가 "/{id}"보다 먼저 매칭돼야 한다.
        # 만약 라우트 순서가 잘못되면 "regions"가 id로 파싱되며 422가 난다.
        with patch(
            "app.api.routers.bicycle_facilities.list_bicycle_subregions",
            return_value=[],
        ):
            res = self.client.get("/api/bicycle-facilities/regions/11/subregions")
        self.assertEqual(res.status_code, 200)

    def test_invalid_parent_code_returns_422(self):
        res = self.client.get("/api/bicycle-facilities/regions/abc/subregions")
        self.assertEqual(res.status_code, 422)


class TestGetFacilityDetailEndpoint(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = _override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(get_db, None)

    @patch(
        "app.api.routers.bicycle_facilities.get_bicycle_facility_by_id",
        return_value=None,
    )
    def test_nonexistent_facility_returns_404(self, mock_get):
        res = self.client.get("/api/bicycle-facilities/999999")
        self.assertEqual(res.status_code, 404)

    @patch(
        "app.api.routers.bicycle_facilities.get_bicycle_facility_by_id",
        return_value={
            "id": 1,
            "facility_title": "테스트 대여소",
            "addr1": "서울특별시 종로구",
            "map_x": 126.9,
            "map_y": 37.5,
            "facility_type": "rental_staffed",
            "rental_fee_type": "무료",
            "repair_available": False,
            "open_hours": "09:00~18:00",
            "total_bikes": 10,
            "available_bikes": None,
            "region_code": "11110",
            "realtime_synced_at": None,
        },
    )
    def test_existing_facility_returns_200(self, mock_get):
        res = self.client.get("/api/bicycle-facilities/1")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["facility_title"], "테스트 대여소")


if __name__ == "__main__":
    unittest.main()
