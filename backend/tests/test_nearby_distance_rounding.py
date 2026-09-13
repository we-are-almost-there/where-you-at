"""distance_m 표시값의 반올림(int()->round() 변경)과 km<->m 왕복 변환을 검증한다."""
import unittest

from app.crud import nearby


class TestDistanceRounding(unittest.TestCase):
    def _row(self, distance_m):
        return {
            "content_id": "A", "name": "a", "address": None,
            "image_url": None, "lat": 0, "lng": 0, "distance_m": distance_m,
        }

    def test_paginate_uses_round_not_truncate(self):
        # int()였다면 100, round()면 101 — 실제 변경사항(int()->round())을 검증
        _, spots = nearby._paginate([self._row(100.9)], "attraction", "trail", 1, 20)
        self.assertEqual(spots[0]["distance_m"], 101)

    def test_duration_minimum_one_minute(self):
        _, spots = nearby._paginate([self._row(5)], "attraction", "trail", 1, 20)
        self.assertEqual(spots[0]["duration_minutes"], 1)

    def test_km_round_trip_preserves_meter_precision_after_rounding(self):
        # distance_m -> distance_km(저장) -> distance_m(조회) 왕복 후에도
        # 최종 표시값이 원래 거리의 반올림과 일치하는지 확인한다.
        original_m = 1234.0
        cached_row = {
            "nearby_content_id": "A", "distance_km": original_m / 1000,
            "name": "a", "address": None, "image_url": None, "lat": 0, "lng": 0,
        }
        rows = nearby._rows_from_cache([cached_row])
        _, spots = nearby._paginate(rows, "attraction", "trail", 1, 20)
        self.assertEqual(spots[0]["distance_m"], round(original_m))


if __name__ == "__main__":
    unittest.main()
