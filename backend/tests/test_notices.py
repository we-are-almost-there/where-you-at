"""GET /api/notices, GET /api/notices/{id} 라우터 테스트 (unittest, DB 없이 crud 함수 patch).

test_course_gpx.py와 같은 방식이다. 라우터가 crud 결과를 응답 형태로 올바르게 옮기는지,
쿼리 파라미터 검증과 404 분기가 맞는지만 확인한다.

다루지 않음 (DB가 있어야 확인 가능):
    - 공개 조건(published_at이 null이거나 미래면 숨김)이 실제로 걸러지는지
    - 고정 공지 → 최근 게시순 정렬
    - total과 offset 계산이 실제 행 수와 맞는지

실행 (backend/ 에서):
    python -m unittest tests.test_notices
"""
import unittest
from datetime import datetime, timezone
from unittest.mock import ANY, MagicMock, patch

from fastapi.testclient import TestClient

from app.deps import get_db
from app.main import app


def _override_get_db():
    yield MagicMock()


_PUBLISHED_AT = datetime(2026, 9, 1, 9, 0, tzinfo=timezone.utc)

_NOTICE_ROW = {
    "id": 1,
    "title": "서비스 오픈 안내",
    "is_pinned": True,
    "published_at": _PUBLISHED_AT,
}


class TestListNotices(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = _override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(get_db, None)

    @patch("app.api.routers.notices.notice_crud.get_notices", return_value=([_NOTICE_ROW], 1))
    def test_returns_paged_envelope_with_defaults(self, mock_get):
        res = self.client.get("/api/notices")

        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            res.json(),
            {
                "total": 1,
                "page": 1,
                "per_page": 20,
                "items": [
                    {
                        "id": 1,
                        "title": "서비스 오픈 안내",
                        "is_pinned": True,
                        "published_at": "2026-09-01T09:00:00Z",
                    }
                ],
            },
        )
        mock_get.assert_called_once_with(ANY, page=1, per_page=20)

    @patch("app.api.routers.notices.notice_crud.get_notices", return_value=([], 0))
    def test_passes_page_params_to_crud(self, mock_get):
        res = self.client.get("/api/notices", params={"page": 3, "per_page": 10})

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"total": 0, "page": 3, "per_page": 10, "items": []})
        mock_get.assert_called_once_with(ANY, page=3, per_page=10)

    @patch("app.api.routers.notices.notice_crud.get_notices")
    def test_rejects_out_of_range_params_without_querying(self, mock_get):
        for params in ({"page": 0}, {"per_page": 0}, {"per_page": 101}):
            with self.subTest(params=params):
                res = self.client.get("/api/notices", params=params)
                self.assertEqual(res.status_code, 422)
        mock_get.assert_not_called()


class TestGetNotice(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = _override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(get_db, None)

    @patch("app.api.routers.notices.notice_crud.get_notice_by_id", return_value=None)
    def test_missing_or_unpublished_returns_404(self, mock_get):
        # crud가 공개 전인 글도 None으로 돌려주므로, 라우터 입장에서는 없는 글과 같다.
        res = self.client.get("/api/notices/999")

        self.assertEqual(res.status_code, 404)
        mock_get.assert_called_once_with(ANY, 999)

    @patch(
        "app.api.routers.notices.notice_crud.get_notice_by_id",
        return_value={**_NOTICE_ROW, "content": "첫 줄\n둘째 줄"},
    )
    def test_returns_detail_with_content(self, mock_get):
        res = self.client.get("/api/notices/1")

        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["id"], 1)
        self.assertEqual(body["content"], "첫 줄\n둘째 줄")
        self.assertEqual(body["published_at"], "2026-09-01T09:00:00Z")


if __name__ == "__main__":
    unittest.main()
