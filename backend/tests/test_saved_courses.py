"""찜한 코스 API(/api/me/saved-courses) 테스트 (unittest, DB 없이 patch).

로그인해야 쓸 수 있고, 추가와 삭제가 멱등이며, 없는 코스·종목과 탈퇴한 회원을 나눠 돌려주는지 확인한다.

실행 (backend/ 에서):
    python -m unittest tests.test_saved_courses
"""
import unittest
from unittest.mock import MagicMock, patch
from uuid import UUID

from fastapi.testclient import TestClient

from app.core.config import settings
from app.crud import saved_course as crud
from app.main import app
from app.services import auth_token

SECRET = "s" * 32
SESSION_ID = UUID("33333333-3333-4333-8333-333333333333")
AUTH_USER = {"id": 7, "nickname": "길손", "bio": None, "kakao_id": 4321}

SAVED_ROW = {
    "id": 12,
    "title": "해파랑길 1코스",
    "start_address": "부산광역시 남구 오륙도로",
    "image_url": None,
    "region_code": "26290",
    "is_population_drop_zone": False,
    "routes": [{"route_type": "bicycle", "distance": 21.3, "estimated_time": 90, "difficulty": None}],
    "path_trail": [],
    "path_bicycle": [],
    "landmarks": [],
    "route_type": "bicycle",
    "saved_at": "2026-09-19T10:00:00+00:00",
}


def _bearer(user_id=7):
    return {"Authorization": f"Bearer {auth_token.create_access_token(user_id, SESSION_ID)}"}


class SavedCoursesTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        secret_patcher = patch.object(settings, "jwt_secret", SECRET)
        secret_patcher.start()
        self.addCleanup(secret_patcher.stop)
        connect_patcher = patch("app.deps.get_db_connection", return_value=MagicMock())
        self.connect = connect_patcher.start()
        self.addCleanup(connect_patcher.stop)
        auth_patcher = patch("app.crud.user.get_authenticated_user", return_value=AUTH_USER)
        self.auth_user = auth_patcher.start()
        self.addCleanup(auth_patcher.stop)

    def assert_deleted_user_token_returns_401_before_saved_course_crud(self):
        self.auth_user.return_value = None
        requests = (
            ("get", "/api/me/saved-courses", None),
            ("get", "/api/me/saved-courses/keys", None),
            ("post", "/api/me/saved-courses", {"course_id": 12, "route_type": "trail"}),
            ("delete", "/api/me/saved-courses/12?route_type=trail", None),
        )

        with (
            patch("app.crud.saved_course.list_saved") as list_saved,
            patch("app.crud.saved_course.list_keys") as list_keys,
            patch("app.crud.saved_course.add") as add,
            patch("app.crud.saved_course.remove") as remove,
        ):
            for method, path, body in requests:
                with self.subTest(method=method, path=path):
                    res = self.client.request(method, path, headers=_bearer(), json=body)
                    self.assertEqual(res.status_code, 401)

        list_saved.assert_not_called()
        list_keys.assert_not_called()
        add.assert_not_called()
        remove.assert_not_called()


class TestRevokedSavedCourses(SavedCoursesTestCase):
    def test_deleted_user_token_returns_401_before_saved_course_crud(self):
        self.assert_deleted_user_token_returns_401_before_saved_course_crud()


class TestReadSavedCourses(SavedCoursesTestCase):
    @patch("app.crud.saved_course.list_saved", return_value=[SAVED_ROW])
    def test_returns_saved_courses(self, mock_list):
        res = self.client.get("/api/me/saved-courses", headers=_bearer())

        self.assertEqual(res.status_code, 200)
        courses = res.json()["courses"]
        self.assertEqual(len(courses), 1)
        self.assertEqual(courses[0]["route_type"], "bicycle")
        self.assertEqual(courses[0]["title"], "해파랑길 1코스")
        self.assertEqual(mock_list.call_args.args[1], 7)

    @patch("app.crud.saved_course.list_keys", return_value=[{"course_id": 12, "route_type": "bicycle"}])
    def test_keys_returns_course_and_route_only(self, mock_keys):
        res = self.client.get("/api/me/saved-courses/keys", headers=_bearer())

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), [{"course_id": 12, "route_type": "bicycle"}])

    def test_without_token_returns_401_without_db(self):
        for path in ("/api/me/saved-courses", "/api/me/saved-courses/keys"):
            with self.subTest(path=path):
                res = self.client.get(path)

                self.assertEqual(res.status_code, 401)
        self.connect.assert_not_called()


class TestAddSavedCourse(SavedCoursesTestCase):
    @patch("app.crud.saved_course.add")
    def test_adds_course_with_route_type(self, mock_add):
        res = self.client.post(
            "/api/me/saved-courses", json={"course_id": 12, "route_type": "bicycle"}, headers=_bearer()
        )

        self.assertEqual(res.status_code, 201)
        self.assertEqual(mock_add.call_args.kwargs, {"user_id": 7, "course_id": 12, "route_type": "bicycle"})

    @patch("app.crud.saved_course.add")
    def test_adding_twice_is_not_an_error(self, mock_add):
        body = {"course_id": 12, "route_type": "trail"}

        first = self.client.post("/api/me/saved-courses", json=body, headers=_bearer())
        second = self.client.post("/api/me/saved-courses", json=body, headers=_bearer())

        self.assertEqual((first.status_code, second.status_code), (201, 201))
        self.assertEqual(mock_add.call_count, 2)

    @patch("app.crud.saved_course.add", side_effect=crud.UnknownRouteError)
    def test_unknown_course_or_route_returns_404(self, _mock_add):
        res = self.client.post(
            "/api/me/saved-courses", json={"course_id": 999, "route_type": "bicycle"}, headers=_bearer()
        )

        self.assertEqual(res.status_code, 404)

    @patch("app.crud.saved_course.add", side_effect=crud.UnknownUserError)
    def test_withdrawn_user_returns_401(self, _mock_add):
        res = self.client.post(
            "/api/me/saved-courses", json={"course_id": 12, "route_type": "trail"}, headers=_bearer()
        )

        self.assertEqual(res.status_code, 401)

    @patch("app.crud.saved_course.add")
    def test_invalid_body_returns_422_without_mutation(self, mock_add):
        cases = {
            "종목이 목록에 없음": {"course_id": 12, "route_type": "walking"},
            "종목 누락": {"course_id": 12},
            "코스 누락": {"route_type": "trail"},
        }
        for name, body in cases.items():
            with self.subTest(name):
                res = self.client.post("/api/me/saved-courses", json=body, headers=_bearer())

                self.assertEqual(res.status_code, 422)
        mock_add.assert_not_called()

    def test_without_token_returns_401_without_db(self):
        res = self.client.post("/api/me/saved-courses", json={"course_id": 12, "route_type": "trail"})

        self.assertEqual(res.status_code, 401)
        self.connect.assert_not_called()


class TestRemoveSavedCourse(SavedCoursesTestCase):
    @patch("app.crud.saved_course.remove")
    def test_removes_one_route_type(self, mock_remove):
        res = self.client.delete("/api/me/saved-courses/12?route_type=bicycle", headers=_bearer())

        self.assertEqual(res.status_code, 204)
        self.assertEqual(mock_remove.call_args.kwargs, {"user_id": 7, "course_id": 12, "route_type": "bicycle"})

    @patch("app.crud.saved_course.remove")
    def test_removing_twice_is_not_an_error(self, _mock_remove):
        first = self.client.delete("/api/me/saved-courses/12?route_type=trail", headers=_bearer())
        second = self.client.delete("/api/me/saved-courses/12?route_type=trail", headers=_bearer())

        self.assertEqual((first.status_code, second.status_code), (204, 204))

    @patch("app.crud.saved_course.remove")
    def test_invalid_route_type_returns_422_without_mutation(self, mock_remove):
        for query in ("", "?route_type=walking"):
            with self.subTest(query=query):
                res = self.client.delete(f"/api/me/saved-courses/12{query}", headers=_bearer())

                self.assertEqual(res.status_code, 422)
        mock_remove.assert_not_called()

    def test_without_token_returns_401_without_db(self):
        res = self.client.delete("/api/me/saved-courses/12?route_type=trail")

        self.assertEqual(res.status_code, 401)
        self.connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
