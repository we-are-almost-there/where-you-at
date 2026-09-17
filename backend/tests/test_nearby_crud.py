"""주변 시설 SQL의 거리 동점 보조 정렬을 DB 없이 검증한다.

실제 DB 페이지네이션과 실시간 조회에서 캐시 조회로의 전환은 별도 검증이 필요하다.
실행 (backend/ 에서):
    python -m unittest discover -s tests -p test_nearby_crud.py -v
"""
import unittest

from app.crud import nearby


class TestNearbySqlOrdering(unittest.TestCase):
    def test_live_queries_prefilter_geometry_and_keep_exact_distance(self):
        for sql, alias in ((nearby._LIVE_QUERY_SQL, "ts"), (nearby._BICYCLE_LIVE_QUERY_SQL, "bf")):
            with self.subTest(alias=alias):
                self.assertIn(f"{alias}.geom && cl.bounds", sql)
                self.assertIn(f"ST_DWithin({alias}.geom::geography, cl.geom::geography, %(radius)s)", sql)
                self.assertIn("ST_Segmentize(geom::geography, 1000)", sql)
                self.assertIn("ELSE ST_MakeEnvelope(-180, -90, 180, 90, 4326)", sql)

    def assert_final_order_by(self, sql: str, expected: str) -> None:
        normalized = " ".join(sql.lower().split()).rstrip(";")
        # 경로 좌표를 잇는 ORDER BY sequence_order와 최종 목록 정렬을 구분한다.
        _, separator, ordering = normalized.rpartition("order by ")
        self.assertTrue(separator, "SQL에 ORDER BY가 있어야 한다")
        self.assertEqual(ordering, expected)

    def test_cache_orders_distance_ties_by_content_id(self):
        self.assert_final_order_by(
            nearby._CACHE_LOOKUP_SQL,
            "ns.distance_km, ns.nearby_content_id",
        )

    def test_bicycle_cache_orders_distance_ties_by_content_id(self):
        self.assert_final_order_by(
            nearby._BICYCLE_CACHE_LOOKUP_SQL,
            "ns.distance_km, ns.nearby_content_id",
        )

    def test_live_orders_distance_ties_by_content_id(self):
        self.assert_final_order_by(
            nearby._LIVE_QUERY_SQL,
            "distance_m, ts.content_id",
        )

    def test_bicycle_live_orders_ids_as_text_to_match_cache(self):
        self.assert_final_order_by(
            nearby._BICYCLE_LIVE_QUERY_SQL,
            "distance_m, bf.bicycle_id::text",
        )


if __name__ == "__main__":
    unittest.main()
