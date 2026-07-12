"""normalize_address 단위테스트 (의존성 없는 stdlib unittest).

실행: backend/ 에서  python -m unittest discover -s tests
"""
import unittest

from app.crud.region import normalize_address, parse_sido_sigungu


class TestNormalizeAddress(unittest.TestCase):
    def test_abbrev_metropolitan_replaced(self):
        # "부산"(광역시 축약) → 정식명으로 교체
        self.assertEqual(
            normalize_address("부산 동구 중앙대로 210", "26110"),
            "부산광역시 동구 중앙대로 210",
        )

    def test_abbrev_do_replaced(self):
        # "경남"(도 축약) → 정식명으로 교체
        self.assertEqual(
            normalize_address("경남 통영시 도남동", "48220"),
            "경상남도 통영시 도남동",
        )

    def test_missing_sido_prepended(self):
        # 시도 없이 시군구로 시작 → 정식 시도명 보강
        self.assertEqual(
            normalize_address("창원시 진해구 명제로486번길 33", "48129"),
            "경상남도 창원시 진해구 명제로486번길 33",
        )

    def test_already_official_unchanged(self):
        # 이미 정식명(카카오 원본)이면 그대로 (멱등)
        addr = "부산광역시 해운대구 우동 620"
        self.assertEqual(normalize_address(addr, "26350"), addr)

    def test_sido_only(self):
        # 시도 축약 단독도 정식명으로
        self.assertEqual(normalize_address("부산", "26110"), "부산광역시")

    def test_ambiguous_metro_abbr_not_dropped(self):
        # "광주"는 광주광역시 약칭이지만 rc=41(경기)이므로 시로 취급, 제거하지 않고 보강.
        # (전역 시도 집합으로 판정하면 "경기도 오포읍"으로 시가 지워지는 버그)
        self.assertEqual(
            normalize_address("광주 오포읍", "41610"),
            "경기도 광주 오포읍",
        )

    def test_gyeonggi_gwangju_full_unchanged(self):
        self.assertEqual(
            normalize_address("경기도 광주시 오포읍", "41610"),
            "경기도 광주시 오포읍",
        )

    def test_none_address(self):
        self.assertIsNone(normalize_address(None, "48220"))

    def test_none_region_code_keeps_original(self):
        self.assertEqual(normalize_address("어딘가 123", None), "어딘가 123")

    def test_unknown_code_keeps_original(self):
        # 매핑에 없는 시도 코드 → 원본 유지
        self.assertEqual(normalize_address("어딘가 123", "99999"), "어딘가 123")


class TestParseSidoSigungu(unittest.TestCase):
    """region_code 역산의 순수 파서 (DB 조회 전 단계)."""

    def test_metro_full(self):
        self.assertEqual(parse_sido_sigungu("부산광역시 동구 중앙대로 210"), ("부산광역시", "동구"))

    def test_metro_abbrev(self):
        self.assertEqual(parse_sido_sigungu("부산 중구 중앙동7가 80"), ("부산광역시", "중구"))

    def test_do_absorbs_gu_into_si(self):
        # "창원시 진해구"는 시(창원시)로 흡수 — parts[1]만 쓰므로 진해구는 무시
        self.assertEqual(parse_sido_sigungu("경남 창원시 진해구 제덕동 885"), ("경상남도", "창원시"))

    def test_do_full(self):
        self.assertEqual(parse_sido_sigungu("경상남도 통영시 도산면 남해안대로 2125"), ("경상남도", "통영시"))

    def test_gun(self):
        self.assertEqual(parse_sido_sigungu("경남 고성군 회화면 배둔리"), ("경상남도", "고성군"))

    def test_no_sido_prefix_returns_none(self):
        # 시도로 시작하지 않으면 시군구 판별 불가 → None(호출부가 sigun 폴백)
        self.assertIsNone(parse_sido_sigungu("창원시 마산합포구 진전면"))

    def test_single_token_or_none(self):
        self.assertIsNone(parse_sido_sigungu("부산"))
        self.assertIsNone(parse_sido_sigungu(None))


if __name__ == "__main__":
    unittest.main()
