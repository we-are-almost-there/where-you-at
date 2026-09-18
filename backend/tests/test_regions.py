"""GET /api/regions의 경로 유형 필터를 DB 없이 검증한다."""

import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.crud.region import list_regions_with_courses
from app.deps import get_db
from app.main import app


def _mock_conn():
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = []
    return conn, cursor


class TestListRegionsWithCourses(unittest.TestCase):
    def test_without_route_type_keeps_all_course_regions(self):
        conn, cursor = _mock_conn()

        list_regions_with_courses(conn)

        sql, params = cursor.execute.call_args.args
        self.assertNotIn("course_route", sql)
        self.assertEqual(params, [])

    def test_route_type_joins_only_matching_routes(self):
        conn, cursor = _mock_conn()

        list_regions_with_courses(conn, sido="강원특별자치도", route_type="trail")

        sql, params = cursor.execute.call_args.args
        self.assertIn("JOIN course_route cr ON cr.course_id = c.id", sql)
        self.assertIn("cr.route_type = %s", sql)
        self.assertIn("WHERE r.sido = %s", sql)
        self.assertEqual(params, ["trail", "강원특별자치도"])


def _override_get_db():
    yield MagicMock()


class TestGetRegions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = _override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(get_db, None)

    @patch("app.api.routers.regions.crud.list_regions_with_courses", return_value=[])
    def test_forwards_route_type(self, mock_list):
        response = self.client.get(
            "/api/regions",
            params={"sido": "강원특별자치도", "type": "trail"},
        )

        self.assertEqual(response.status_code, 200)
        mock_list.assert_called_once_with(
            unittest.mock.ANY,
            sido="강원특별자치도",
            route_type="trail",
        )

    @patch("app.api.routers.regions.crud.list_regions_with_courses", return_value=[])
    def test_rejects_unknown_route_type(self, mock_list):
        response = self.client.get("/api/regions", params={"type": "horse"})

        self.assertEqual(response.status_code, 422)
        mock_list.assert_not_called()


if __name__ == "__main__":
    unittest.main()
