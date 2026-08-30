"""GET /api/courses/{id}/gpx 라우터 테스트 (unittest, DB 없이 crud 함수 patch).

course 존재 여부에 따라 404 / 200+[] 가 올바르게 갈리는지만 검증한다.
(실제 waypoint 쿼리 정확성은 여기서 다루지 않음 — 별도 DB 기반 테스트 필요)

테스트 범위: 이번 course 존재 여부 404 fix에 한정한다.
    - course_exists=False -> 404
    - course_exists=True, waypoint 없음 -> 200 + 빈 배열 (경로 미수집 코스)
    - course_exists=True, waypoint 있음 -> 200 + 데이터

    아래는 이번 수정 범위 밖이라 다루지 않음(추후 gpx 라우터 전체 테스트 시 추가):
    - route_type 기본값("trail")이 get_waypoints에 그대로 전달되는지
    - route_type에 도보/자전거 외의 값이 들어왔을 때의 처리
    - 404일 때 get_waypoints가 호출되지 않는지(불필요한 쿼리 방지)

실행 (backend/ 에서):
    python -m unittest discover -s tests        # 전체 테스트
    python -m unittest tests.test_course_gpx    # 이 파일만
"""
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.deps import get_db


def _override_get_db():
    # 라우터가 conn을 실제로 쓰지 않도록(crud를 patch하므로) 더미 객체만 흘려보낸다.
    yield MagicMock()


class TestGetCourseGpx(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = _override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(get_db, None)

    @patch("app.api.routers.courses.crud.course_exists", return_value=False)
    def test_course_not_found_returns_404(self, mock_exists):
        res = self.client.get("/api/courses/999999/gpx")
        self.assertEqual(res.status_code, 404)
        mock_exists.assert_called_once_with(unittest.mock.ANY, 999999)

    @patch("app.api.routers.courses.crud.get_waypoints", return_value=[])
    @patch("app.api.routers.courses.crud.course_exists", return_value=True)
    def test_course_exists_but_no_waypoints_returns_200_empty(self, mock_exists, mock_waypoints):
        # 코스는 있는데 경로가 아직 안 들어온 경우 — 404가 아니라 빈 배열이어야 한다.
        res = self.client.get("/api/courses/1/gpx")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            res.json(),
            {"course_id": 1, "route_type": "trail", "waypoints": []},
        )

    @patch(
        "app.api.routers.courses.crud.get_waypoints",
        return_value=[{"lat": 35.0, "lng": 129.0}, {"lat": 35.1, "lng": 129.1}],
    )
    @patch("app.api.routers.courses.crud.course_exists", return_value=True)
    def test_course_exists_with_waypoints_returns_200_with_data(self, mock_exists, mock_waypoints):
        res = self.client.get("/api/courses/1/gpx", params={"route_type": "bicycle"})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["course_id"], 1)
        self.assertEqual(body["route_type"], "bicycle")
        self.assertEqual(len(body["waypoints"]), 2)
        self.assertEqual(body["waypoints"][0], {"lat": 35.0, "lng": 129.0})


if __name__ == "__main__":
    unittest.main()
