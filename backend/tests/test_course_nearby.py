"""GET /api/courses/{id}/nearby 라우터 테스트 (unittest, DB 없이 crud 함수 patch).

course 존재 여부에 따라 404 / 200+[] 가 올바르게 갈리는지만 검증한다.
(실제 PostGIS 쿼리 정확성은 여기서 다루지 않음 — 별도 DB 기반 테스트 필요)

테스트 범위: 이번 course 존재 여부 404 fix에 한정한다.
    - course_exists=False -> 404
    - course_exists=True, spots 없음 -> 200 + 빈 배열
    - course_exists=True, spots 있음 -> 200 + 데이터
    - category 누락 -> 422 (기존 검증 로직이 이번 변경으로 안 깨졌는지 회귀 확인용)

    아래는 이번 수정 범위 밖이라 다루지 않음(추후 nearby 라우터 전체 테스트 시 추가):
    - category/route_type에 패턴에 안 맞는 값이 들어왔을 때의 422
    - page/size 범위(ge=1, le=50 등) 검증
    - route_type 기본값("trail")이 list_nearby_spots에 그대로 전달되는지
    - 404일 때 list_nearby_spots가 호출되지 않는지(불필요한 쿼리 방지)

실행 (backend/ 에서):
    python -m unittest discover -s tests           # 전체 테스트
    python -m unittest tests.test_course_nearby     # 이 파일만

다른 엔드포인트(예: GET /courses/{id})를 테스트할 땐 이 파일에 추가하지 말고
    test_course_detail.py처럼 해당 엔드포인트 이름을 딴 새 파일로 만들 것.
    공통 셋업이 반복되면 conftest.py로 뺄 것.
"""
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.deps import get_db


def _override_get_db():
    # 라우터가 conn을 실제로 쓰지 않도록(crud를 patch하므로) 더미 객체만 흘려보낸다.
    yield MagicMock()


class TestGetCourseNearby(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = _override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(get_db, None)

    @patch("app.api.routers.courses.crud.course_exists", return_value=False)
    def test_course_not_found_returns_404(self, mock_exists):
        res = self.client.get(
            "/api/courses/999999/nearby",
            params={"category": "attraction"},
        )
        self.assertEqual(res.status_code, 404)
        mock_exists.assert_called_once_with(unittest.mock.ANY, 999999)

    @patch("app.api.routers.courses.nearby_crud.list_nearby_spots", return_value=(0, []))
    @patch("app.api.routers.courses.crud.course_exists", return_value=True)
    def test_course_exists_but_no_spots_returns_200_empty(self, mock_exists, mock_list):
        res = self.client.get(
            "/api/courses/1/nearby",
            params={"category": "attraction"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"total_count": 0, "spots": []})

    @patch(
        "app.api.routers.courses.nearby_crud.list_nearby_spots",
        return_value=(
            1,
            [
                {
                    "id": "abc123",
                    "category": "attraction",
                    "name": "테스트 관광지",
                    "address": "테스트 주소",
                    "image_url": None,
                    "lat": 35.0,
                    "lng": 129.0,
                    "distance_m": 500,
                    "duration_minutes": 7,
                }
            ],
        ),
    )
    @patch("app.api.routers.courses.crud.course_exists", return_value=True)
    def test_course_exists_with_spots_returns_200_with_data(self, mock_exists, mock_list):
        res = self.client.get(
            "/api/courses/1/nearby",
            params={"category": "attraction"},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["total_count"], 1)
        self.assertEqual(len(body["spots"]), 1)
        self.assertEqual(body["spots"][0]["name"], "테스트 관광지")

    def test_missing_required_category_returns_422(self):
        # category는 필수 쿼리 파라미터 — 없으면 FastAPI validation이 422
        res = self.client.get("/api/courses/1/nearby")
        self.assertEqual(res.status_code, 422)


if __name__ == "__main__":
    unittest.main()
