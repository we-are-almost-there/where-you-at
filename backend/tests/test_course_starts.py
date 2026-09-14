"""이용자 위치를 서버로 받지 않는 '가까운 순' 관련 테스트.

- GET /api/courses/starts: 홈 '가까운 코스'를 브라우저에서 고르기 위한 출발점 전체 목록
- list_course_starts: 도보 경로가 있는 코스만 담고, 도보 출발점 좌표가 비면 None
- 목록 API가 좌표 파라미터를 crud로 넘기지 않는지, 전체 목록을 받을 수 있는 size 상한

실행: backend/ 에서  python -m unittest discover -s tests
"""
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.crud.course import list_course_starts
from app.deps import get_db
from app.main import app


def _override_get_db():
    yield MagicMock()


_START_ROW = {
    "id": 1,
    "title": "해파랑길 1코스",
    "start_address": "부산광역시 남구",
    "image_url": None,
    "region_code": "26290",
    "routes": [{"route_type": "trail", "distance": 17.8, "estimated_time": 360, "difficulty": "medium"}],
    "start": {"lat": 35.1, "lng": 129.1},
}


class TestCourseStartsEndpoint(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = _override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(get_db, None)

    @patch("app.api.routers.courses.crud.list_course_starts", return_value=[_START_ROW])
    def test_returns_all_starts_without_query_params(self, mock_starts):
        # "/starts"가 "/{id}" 경로에 가려지면 422가 난다.
        res = self.client.get("/api/courses/starts")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body[0]["start"], {"lat": 35.1, "lng": 129.1})
        self.assertNotIn("path_trail", body[0])
        mock_starts.assert_called_once()

    @patch("app.api.routers.courses.crud.list_courses", return_value=(0, []))
    def test_list_does_not_forward_coordinates(self, mock_list):
        res = self.client.get(
            "/api/courses", params={"sort": "nearest", "lat": 37.5, "lng": 127.0, "size": 500}
        )
        self.assertEqual(res.status_code, 200)
        _, kwargs = mock_list.call_args
        self.assertNotIn("lat", kwargs)
        self.assertNotIn("lng", kwargs)
        self.assertEqual(kwargs["size"], 500)

    def test_list_size_above_limit_returns_422(self):
        res = self.client.get("/api/courses", params={"size": 501})
        self.assertEqual(res.status_code, 422)


class TestListCourseStartsCrud(unittest.TestCase):
    def _conn(self, rows, route_rows):
        conn = MagicMock()
        cursor = MagicMock()
        # 첫 execute는 출발점 목록, 두 번째는 경로(_fetch_routes)
        cursor.fetchall.side_effect = [rows, route_rows]
        conn.cursor.return_value.__enter__.return_value = cursor
        return conn

    def test_uses_trail_start_and_attaches_routes(self):
        conn = self._conn(
            rows=[
                {"id": 1, "title": "A", "start_address": None, "image_url": None, "region_code": None,
                 "start_lat": 35.1, "start_lng": 129.1},
                # 위도만 있고 경도가 없으면 좌표가 섞이지 않게 출발점을 비운다.
                {"id": 2, "title": "B", "start_address": None, "image_url": None, "region_code": None,
                 "start_lat": 35.2, "start_lng": None},
            ],
            route_rows=[
                {"course_id": 1, "route_type": "trail", "distance": 10, "estimated_time": 120, "difficulty": "easy"},
                {"course_id": 1, "route_type": "bicycle", "distance": 12, "estimated_time": 60, "difficulty": None},
            ],
        )

        result = list_course_starts(conn)

        self.assertEqual(result[0]["start"], {"lat": 35.1, "lng": 129.1})
        self.assertEqual([r["route_type"] for r in result[0]["routes"]], ["trail", "bicycle"])
        self.assertIsNone(result[1]["start"])
        self.assertEqual(result[1]["routes"], [])

    def test_empty_table_skips_route_query(self):
        conn = self._conn(rows=[], route_rows=[])
        self.assertEqual(list_course_starts(conn), [])

    def test_only_courses_with_trail_route(self):
        # 위치를 못 얻었을 때의 대체 목록(GET /api/courses 기본 type=trail)과 코스 범위를 맞춘다.
        # 자전거 전용 코스가 섞이면 위치 허용 여부에 따라 홈에 보이는 코스 종류가 달라진다.
        conn = self._conn(rows=[], route_rows=[])
        list_course_starts(conn)
        sql = conn.cursor.return_value.__enter__.return_value.execute.call_args_list[0].args[0]
        self.assertIn("JOIN course_route t ON t.course_id = c.id AND t.route_type = 'trail'", sql)
        self.assertNotIn("LEFT JOIN", sql)
        self.assertNotIn("'bicycle'", sql)


if __name__ == "__main__":
    unittest.main()
