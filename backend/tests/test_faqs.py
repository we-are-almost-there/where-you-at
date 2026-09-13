"""GET /api/faqs 라우터 테스트 (unittest, DB 없이 crud 함수 patch).

test_course_gpx.py와 같은 방식이다. 라우터가 crud 결과를 그대로 목록으로 내보내는지만 확인한다.

다루지 않음 (DB가 있어야 확인 가능):
    - is_published가 false인 행이 빠지는지
    - faq_category 조인으로 카테고리 이름이 채워지는지
    - 카테고리 순서(faq_category.sort_order) → 카테고리 안 순서(faq.sort_order) 정렬

실행 (backend/ 에서):
    python -m unittest tests.test_faqs
"""
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.deps import get_db
from app.main import app


def _override_get_db():
    yield MagicMock()


class TestListFaqs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = _override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(get_db, None)

    @patch(
        "app.api.routers.faqs.faq_crud.get_faqs",
        return_value=[
            {"id": 2, "category": "코스", "question": "질문 A", "answer": "답변 A"},
            {"id": 1, "category": "기록", "question": "질문 B", "answer": "답변 B"},
        ],
    )
    def test_returns_rows_in_crud_order(self, mock_get):
        res = self.client.get("/api/faqs")

        self.assertEqual(res.status_code, 200)
        # 정렬은 SQL이 맡으므로 라우터는 순서를 바꾸지 않아야 한다.
        self.assertEqual([row["id"] for row in res.json()], [2, 1])
        self.assertEqual(
            res.json()[0],
            {"id": 2, "category": "코스", "question": "질문 A", "answer": "답변 A"},
        )
        mock_get.assert_called_once()

    @patch("app.api.routers.faqs.faq_crud.get_faqs", return_value=[])
    def test_empty_returns_200_with_empty_list(self, mock_get):
        res = self.client.get("/api/faqs")

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), [])


if __name__ == "__main__":
    unittest.main()
