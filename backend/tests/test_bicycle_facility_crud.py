"""app/crud/bicycle_facility.py 전체 단위테스트.

list_bicycle_facilities(목록+필터), list_bicycle_regions(지역 목록),
list_bicycle_subregions(하위 지역), get_bicycle_facility_by_id(상세)를
DB 없이 목 커넥션으로 검증한다.

실행: backend/ 에서  python -m unittest discover -s tests
"""
import unittest
from unittest.mock import MagicMock

from app.crud.bicycle_facility import (
    get_bicycle_facility_by_id,
    list_bicycle_facilities,
    list_bicycle_regions,
    list_bicycle_subregions,
)

_UNSET = object()  # fetchone_row 미지정을 None(실제 "없음" 결과)과 구분하기 위한 sentinel


def _mock_conn(total=0, rows=None, fetchone_row=_UNSET):
    """cursor().execute() 호출마다 count/rows/단건을 반환하는 목 커넥션."""
    conn = MagicMock()
    cursor = MagicMock()
    cursor.fetchone.return_value = {"total": total} if fetchone_row is _UNSET else fetchone_row
    cursor.fetchall.return_value = rows or []
    conn.cursor.return_value.__enter__.return_value = cursor
    return conn, cursor


def _call_sql_params(cursor, call_index=0):
    sql, params = cursor.execute.call_args_list[call_index].args
    return sql, params


# ── list_bicycle_facilities ──────────────────────────────────────────────


class TestListBicycleFacilitiesNoFilter(unittest.TestCase):
    def test_no_filters_produces_empty_where(self):
        conn, cursor = _mock_conn()
        list_bicycle_facilities(conn)
        sql, params = _call_sql_params(cursor)
        self.assertNotIn("WHERE", sql)
        self.assertEqual(params, [])


class TestListBicycleFacilitiesRegionFilter(unittest.TestCase):
    def test_region_filter_uses_prefix_like(self):
        conn, cursor = _mock_conn()
        list_bicycle_facilities(conn, region="11")
        sql, params = _call_sql_params(cursor)
        self.assertIn("region_code LIKE %s", sql)
        self.assertEqual(params, ["11%"])

    def test_region_5digit_filter(self):
        conn, cursor = _mock_conn()
        list_bicycle_facilities(conn, region="41111")
        sql, params = _call_sql_params(cursor)
        self.assertEqual(params, ["41111%"])


class TestListBicycleFacilitiesTypeFilter(unittest.TestCase):
    def test_facility_type_filter_exact_match(self):
        conn, cursor = _mock_conn()
        list_bicycle_facilities(conn, facility_type="rental_unmanned")
        sql, params = _call_sql_params(cursor)
        self.assertIn("facility_type = %s", sql)
        self.assertEqual(params, ["rental_unmanned"])


class TestListBicycleFacilitiesFeeFilter(unittest.TestCase):
    def test_free_filter_uses_single_placeholder(self):
        conn, cursor = _mock_conn()
        list_bicycle_facilities(conn, fee_type="무료")
        sql, params = _call_sql_params(cursor)
        self.assertIn("rental_fee_type = %s", sql)
        self.assertEqual(params, ["무료"])

    def test_paid_filter_includes_mixed_and_two_placeholders(self):
        # 과거 params.append(fee_type)의 들여쓰기 버그로 "유료" 선택 시
        # TypeError(파라미터 개수 불일치)가 났던 부분 — 회귀 방지.
        conn, cursor = _mock_conn()
        list_bicycle_facilities(conn, fee_type="유료")
        sql, params = _call_sql_params(cursor)
        self.assertIn("rental_fee_type IN (%s, %s)", sql)
        self.assertEqual(sql.count("%s"), len(params))
        self.assertEqual(params, ["유료", "혼합"])

    def test_no_fee_filter_adds_no_params(self):
        conn, cursor = _mock_conn()
        list_bicycle_facilities(conn, fee_type=None)
        sql, params = _call_sql_params(cursor)
        self.assertNotIn("rental_fee_type", sql)
        self.assertEqual(params, [])


class TestListBicycleFacilitiesDataSourceFilter(unittest.TestCase):
    def test_standard_filters_std_prefix(self):
        conn, cursor = _mock_conn()
        list_bicycle_facilities(conn, data_source="standard")
        sql, params = _call_sql_params(cursor)
        self.assertIn("source_id LIKE %s", sql)
        self.assertEqual(params, ["std:%"])

    def test_realtime_filters_rt_prefix(self):
        conn, cursor = _mock_conn()
        list_bicycle_facilities(conn, data_source="realtime")
        sql, params = _call_sql_params(cursor)
        self.assertEqual(params, ["rt:%"])

    def test_unknown_data_source_ignored(self):
        conn, cursor = _mock_conn()
        list_bicycle_facilities(conn, data_source="something_else")
        sql, params = _call_sql_params(cursor)
        self.assertNotIn("source_id", sql)
        self.assertEqual(params, [])


class TestListBicycleFacilitiesCombinedFilters(unittest.TestCase):
    def test_region_and_fee_and_data_source_together(self):
        conn, cursor = _mock_conn()
        list_bicycle_facilities(
            conn,
            region="11",
            facility_type="rental_staffed",
            fee_type="유료",
            data_source="standard",
        )
        sql, params = _call_sql_params(cursor)
        self.assertEqual(sql.count("%s"), len(params))
        self.assertEqual(params, ["11%", "rental_staffed", "유료", "혼합", "std:%"])

    def test_pagination_params_appended_to_second_query(self):
        conn, cursor = _mock_conn()
        list_bicycle_facilities(conn, fee_type="유료", page=2, size=10)
        sql, params = _call_sql_params(cursor, call_index=1)
        self.assertEqual(sql.count("%s"), len(params))
        self.assertEqual(params, ["유료", "혼합", 10, 10])


class TestListBicycleFacilitiesOrder(unittest.TestCase):
    # 이용자 위치를 서버로 받지 않으므로 '가까운 순'은 브라우저가 전체 목록을 받아 정렬한다.
    # 서버는 좌표 인자를 받지 않고 항상 bicycle_id 순으로 돌려준다.
    def test_always_orders_by_bicycle_id_without_distance(self):
        conn, cursor = _mock_conn()
        list_bicycle_facilities(conn, data_source="realtime", page=1, size=5000)
        sql, params = _call_sql_params(cursor, call_index=1)
        self.assertIn("ORDER BY bicycle_id", sql)
        self.assertNotIn("ST_Distance", sql)
        self.assertEqual(params, ["rt:%", 5000, 0])


# ── list_bicycle_regions ─────────────────────────────────────────────────


class TestListBicycleRegions(unittest.TestCase):
    def test_no_data_source_filters_only_non_null_region(self):
        conn, cursor = _mock_conn()
        list_bicycle_regions(conn)
        sql, params = _call_sql_params(cursor)
        self.assertIn("bf.region_code IS NOT NULL", sql)
        self.assertNotIn("source_id", sql)
        self.assertEqual(params, [])

    def test_standard_filters_std_prefix(self):
        conn, cursor = _mock_conn()
        list_bicycle_regions(conn, data_source="standard")
        sql, params = _call_sql_params(cursor)
        self.assertIn("bf.source_id LIKE %s", sql)
        self.assertEqual(params, ["std:%"])

    def test_realtime_filters_rt_prefix(self):
        conn, cursor = _mock_conn()
        list_bicycle_regions(conn, data_source="realtime")
        sql, params = _call_sql_params(cursor)
        self.assertEqual(params, ["rt:%"])

    def test_returns_rows_from_cursor(self):
        rows = [
            {"region_code": "11110", "name": "종로구", "sido": "서울특별시"},
            {"region_code": "41110", "name": "수원시", "sido": "경기도"},
        ]
        conn, cursor = _mock_conn(rows=rows)
        result = list_bicycle_regions(conn)
        self.assertEqual(result, rows)


# ── list_bicycle_subregions ──────────────────────────────────────────────


class TestListBicycleSubregionsQuery(unittest.TestCase):
    def test_parent_code_used_as_like_prefix(self):
        conn, cursor = _mock_conn(rows=[])
        list_bicycle_subregions(conn, "11")
        sql, params = _call_sql_params(cursor)
        self.assertIn("bf.region_code LIKE %s", sql)
        self.assertEqual(params[0], "11%")

    def test_data_source_standard_adds_source_filter(self):
        conn, cursor = _mock_conn(rows=[])
        list_bicycle_subregions(conn, "11", data_source="standard")
        sql, params = _call_sql_params(cursor)
        self.assertIn("bf.source_id LIKE %s", sql)
        self.assertEqual(params, ["11%", "std:%"])

    def test_data_source_realtime_adds_source_filter(self):
        conn, cursor = _mock_conn(rows=[])
        list_bicycle_subregions(conn, "11", data_source="realtime")
        sql, params = _call_sql_params(cursor)
        self.assertEqual(params, ["11%", "rt:%"])


class TestListBicycleSubregionsSejongCase(unittest.TestCase):
    def test_sejong_self_row_excluded(self):
        # 세종은 region 테이블에 자기 자신 row(36110)만 있다.
        conn, cursor = _mock_conn(
            rows=[{"region_code": "36110", "name": "세종특별자치시", "sido": "세종특별자치시", "cnt": 707}]
        )
        result = list_bicycle_subregions(conn, "36")
        self.assertEqual(result, [])

    def test_real_subregion_included(self):
        conn, cursor = _mock_conn(
            rows=[{"region_code": "41111", "name": "수원시 장안구", "sido": "경기도", "cnt": 2}]
        )
        result = list_bicycle_subregions(conn, "4111")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["name"], "수원시 장안구")

    def test_mixed_rows_self_filtered_others_kept(self):
        conn, cursor = _mock_conn(
            rows=[
                {"region_code": "36110", "name": "세종특별자치시", "sido": "세종특별자치시", "cnt": 707},
                {"region_code": "41111", "name": "수원시 장안구", "sido": "경기도", "cnt": 2},
            ]
        )
        result = list_bicycle_subregions(conn, "36")
        names = [r["name"] for r in result]
        self.assertNotIn("세종특별자치시", names)

    def test_region_code_shorter_than_parent_excluded(self):
        conn, cursor = _mock_conn(
            rows=[
                {"region_code": "11", "name": "서울특별시", "sido": "서울특별시", "cnt": 5},
                {"region_code": "11110", "name": "종로구", "sido": "서울특별시", "cnt": 3},
            ]
        )
        result = list_bicycle_subregions(conn, "11")
        names = [r["name"] for r in result]
        self.assertNotIn("서울특별시", names)
        self.assertIn("종로구", names)


# ── get_bicycle_facility_by_id ───────────────────────────────────────────


class TestGetBicycleFacilityById(unittest.TestCase):
    def test_existing_facility_returns_dict(self):
        row = {
            "id": 1,
            "facility_title": "호암직동사무소",
            "addr1": "충청북도 충주시 호암중앙1로 35",
            "map_x": 127.9,
            "map_y": 36.9,
            "facility_type": "rental_staffed",
            "rental_fee_type": "무료",
            "repair_available": False,
            "open_hours": "09:00~18:00",
            "total_bikes": 0,
            "available_bikes": None,
            "region_code": "43113",
            "realtime_synced_at": None,
        }
        conn, cursor = _mock_conn(fetchone_row=row)
        result = get_bicycle_facility_by_id(conn, 1)
        self.assertEqual(result["facility_title"], "호암직동사무소")

    def test_nonexistent_facility_returns_none(self):
        conn, cursor = _mock_conn(fetchone_row=None)
        result = get_bicycle_facility_by_id(conn, 999999)
        self.assertIsNone(result)

    def test_query_uses_bicycle_id_param(self):
        conn, cursor = _mock_conn(fetchone_row=None)
        get_bicycle_facility_by_id(conn, 42)
        sql, params = _call_sql_params(cursor)
        self.assertIn("WHERE bicycle_id = %s", sql)
        self.assertEqual(params, [42])


if __name__ == "__main__":
    unittest.main()
