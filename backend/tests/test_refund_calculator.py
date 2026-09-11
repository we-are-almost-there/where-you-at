"""환급 계산의 지역별 override 처리 (DB 없이 순수 함수만 본다).

반값여행은 최소 소비 금액이 지역마다 다르다. 기본 규칙이 10만 원이고, 그보다 낮은
지역은 03_support_seed.sql의 override 목록으로 덮는다. 목록에서 한 지역이 빠지면
계산이 실패하는 게 아니라 조용히 기본값 10만 원을 쓴다 — 화천(최소 7만)이 빠져 있어
7만~9만 9,999원을 넣으면 예상 환급액이 0원으로 나왔다.

크래시가 아니라 "그럴듯한 오답"이라 눈에 띄지 않는다. 그 경로를 고정해 둔다.

실행 (backend/ 에서):
    python -m unittest tests.test_refund_calculator
"""
import unittest

from app.services.refund_calculator import calculate_refund

# crud.get_policies_for_calc가 내주는 행 한 줄의 모양.
# 제도 정보와 규칙이 한 행에 같이 실려 온다.
BASE = {
    "support_id": 1,
    "support_title": "대한민국 반값여행",
    "max_amount": 100_000,
    "is_pre_approval": True,
    "apply_url": None,
    "category": "전체",
    "min_spend": 100_000,
    "min_nights": None,
    "max_nights": None,
    "cap_at_spend": True,
    "refund_value": 50,
    "is_rate": True,
    "override_region_id": None,
    "description": "",
}

REGION_ID = 42


def _row(**changes) -> dict:
    return {**BASE, **changes}


def _calc(rows, spent: int) -> dict:
    return calculate_refund(rows, {"전체": spent}, stay_duration=1)


def _refund(rows, spent: int) -> int:
    return _calc(rows, spent)["expected_refund"]


class TestRegionOverride(unittest.TestCase):
    def test_override_replaces_the_common_minimum(self):
        # 화천처럼 최소 7만인 지역. SQL이 이 지역의 override만 함께 실어 보낸다.
        rows = [
            _row(),
            _row(min_spend=70_000, override_region_id=REGION_ID),
        ]
        self.assertEqual(_refund(rows, 70_000), 35_000)

    def test_a_region_missing_from_the_override_list_falls_back_to_the_common_rule(self):
        # override를 빠뜨리면 이렇게 된다 — 예외가 아니라 0원이 답으로 나온다.
        # 화천이 이 상태였다.
        self.assertEqual(_refund([_row()], 70_000), 0)

    def test_override_still_refuses_spending_below_its_own_minimum(self):
        rows = [
            _row(),
            _row(min_spend=70_000, override_region_id=REGION_ID),
        ]
        self.assertEqual(_refund(rows, 69_999), 0)

    def test_override_does_not_lower_the_rate(self):
        # 최소 소비만 다르고 환급률(50%)은 같다
        rows = [
            _row(),
            _row(min_spend=30_000, override_region_id=REGION_ID),
        ]
        self.assertEqual(_refund(rows, 40_000), 20_000)

    def test_override_replaces_the_common_rule_even_when_both_qualify(self):
        """지출이 둘 다 넘겨도 override 쪽 규칙만 남아야 한다.

        두 규칙은 최소 소비만 다르고 환급률이 같아 금액으로는 구분되지 않는다.
        갈리는 건 사용자에게 보이는 근거 문구다 — 공통 규칙이 살아남으면 화천
        사용자에게 '10만 원 이상' 조건이 그대로 안내된다.
        """
        rows = [
            _row(description="전 지역 공통: 10만 원 이상"),
            _row(
                min_spend=70_000,
                override_region_id=REGION_ID,
                description="화천: 총 7만 원 이상 소비 시 50% 환급",
            ),
        ]
        basis = _calc(rows, 150_000)["calculation_basis"]
        self.assertEqual([b["description"] for b in basis], ["화천: 총 7만 원 이상 소비 시 50% 환급"])

    def test_refund_is_capped_by_the_support_maximum(self):
        # 50%면 15만이지만 제도 상한이 10만이다
        rows = [_row()]
        self.assertEqual(_refund(rows, 300_000), 100_000)


if __name__ == "__main__":
    unittest.main()
