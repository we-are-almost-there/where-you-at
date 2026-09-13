"""list_version 해시가 목록 변경(추가·삭제·순서)을 정확히 반영하는지 검증한다."""
import unittest

from app.crud import nearby


class TestListVersion(unittest.TestCase):
    def test_id_addition_changes_version(self):
        base = [{"content_id": "A"}, {"content_id": "B"}]
        added = [{"content_id": "A"}, {"content_id": "B"}, {"content_id": "C"}]
        v1 = nearby._make_list_version(5, "attraction", "trail", base)
        v2 = nearby._make_list_version(5, "attraction", "trail", added)
        self.assertNotEqual(v1, v2)

    def test_id_removal_changes_version(self):
        base = [{"content_id": "A"}, {"content_id": "B"}]
        removed = [{"content_id": "A"}]
        v1 = nearby._make_list_version(5, "attraction", "trail", base)
        v2 = nearby._make_list_version(5, "attraction", "trail", removed)
        self.assertNotEqual(v1, v2)

    def test_order_change_changes_version(self):
        forward = [{"content_id": "A"}, {"content_id": "B"}]
        reversed_ = [{"content_id": "B"}, {"content_id": "A"}]
        v1 = nearby._make_list_version(5, "attraction", "trail", forward)
        v2 = nearby._make_list_version(5, "attraction", "trail", reversed_)
        self.assertNotEqual(v1, v2)

    def test_same_full_list_same_version_regardless_of_page(self):
        rows = [{"content_id": "A"}, {"content_id": "B"}, {"content_id": "C"}]
        # _make_list_version은 전체 rows를 받는다 — 페이지 분할은 _paginate가 뒤에서 하므로
        # 같은 전체 목록이면 어느 페이지를 조회하든 해시 자체는 동일해야 한다.
        v1 = nearby._make_list_version(5, "attraction", "trail", rows)
        v2 = nearby._make_list_version(5, "attraction", "trail", rows)
        self.assertEqual(v1, v2)

    def test_different_course_category_route_type_changes_version(self):
        rows = [{"content_id": "A"}]
        base = nearby._make_list_version(5, "attraction", "trail", rows)
        self.assertNotEqual(base, nearby._make_list_version(6, "attraction", "trail", rows))
        self.assertNotEqual(base, nearby._make_list_version(5, "restaurant", "trail", rows))
        self.assertNotEqual(base, nearby._make_list_version(5, "attraction", "bicycle", rows))

    def test_name_or_distance_change_keeps_version_when_ids_and_order_same(self):
        v1 = nearby._make_list_version(5, "attraction", "trail", [
            {"content_id": "A", "name": "old", "distance_m": 100},
        ])
        v2 = nearby._make_list_version(5, "attraction", "trail", [
            {"content_id": "A", "name": "new", "distance_m": 999},
        ])
        self.assertEqual(v1, v2)
