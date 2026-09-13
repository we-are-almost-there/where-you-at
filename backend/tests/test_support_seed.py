"""03_support_seed.sql의 support_schedule 입력 형식 검사 (DB 없이 텍스트만 본다).

apply_start·apply_end는 timestamptz 컬럼인데 시드에 '2026-05-26'처럼 날짜만 적으면
세션 타임존 기준 그날 0시로 저장돼, "26일까지 접수"라는 의도와 달리 마감일 하루가
통째로 빠진다. status만 보던 때는 드러나지 않았지만 이제 판정이 이 값을 쓴다.

검사 범위
    - 모든 행이 실제로 검사를 받았는지 (정규식이 조용히 건너뛴 행이 없는지)
    - apply_start·apply_end에 시각과 +09가 함께 적혀 있는지
    - apply_start <= apply_end 인지 (완도 3차가 실제로 뒤집혀 있었다)
    - 한국 시간 오프셋이 아닌 값(+10 등)이 섞여 있지 않은지
    - travel_end가 비어 있지 않은지 (그 차수를 닫는 유일한 조건이다)

실행 (backend/ 에서):
    python -m unittest tests.test_support_seed
"""
import datetime as dt
import re
import unittest
from pathlib import Path

SEED = Path(__file__).resolve().parents[1] / "sql" / "03_support_seed.sql"

SCHEDULE_ROW_PREFIX = "('대한민국 반값여행',"

# ('대한민국 반값여행', '12780', 1, apply_start, apply_end, 여행시작, 여행종료, '상태')
# 여행 기간은 날짜 또는 null이다. 인용부호만 받으면 null인 행이 조용히 빠지고,
# 그 행의 apply_start·apply_end는 아무 검사도 받지 않은 채 통과한다.
ROW = re.compile(
    r"\('대한민국 반값여행',\s*'(\d+)',\s*(\d+),\s*([^,]+),\s*([^,]+),"
    r"\s*(?:'[^']*'|null),\s*('[^']*'|null),\s*'([^']+)'\)"
)
STAMP = re.compile(r"^'(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?)\+09'$")


def _block():
    """support_schedule의 values 목록만. 파일 끝까지 잡으면 뒤에 다른 섹션이
    붙었을 때 그쪽 행까지 세어 '검사된 행 수' 검사가 헛 오탐을 낸다."""
    text = SEED.read_text(encoding="utf-8")
    start = text.index("insert into support_schedule")
    return text[start : text.index(") as v(", start)]


def _rows():
    return [
        (code, int(rnd), start.strip(), end.strip(), travel_end.strip(), status)
        for code, rnd, start, end, travel_end, status in ROW.findall(_block())
    ]


def _inverted(code: str, rnd: int, start: str, end: str) -> str | None:
    """신청 종료가 시작보다 앞서면 사유 문자열, 아니면 None. 둘 다 있어야 비교한다."""
    s, e = _parse(start), _parse(end)
    if s is None or e is None:
        return None
    if s <= e:
        return None
    return f"{code} {rnd}차: 신청 종료({end})가 시작({start})보다 앞선다"


def _parse(value: str) -> dt.datetime | None:
    if value == "null":
        return None
    m = STAMP.match(value)
    if not m:
        return None
    date, time = m.group(1), m.group(2)
    if len(time) == 5:
        time += ":00"
    return dt.datetime.fromisoformat(f"{date}T{time}+09:00")


class TestRefundOverrideSeed(unittest.TestCase):
    """반값여행 지역별 최소 소비 override 목록.

    override는 지역 코드로 join한다. 코드가 틀리면 insert가 실패하는 게 아니라
    join이 0행이 되어 그 지역만 조용히 기본 규칙(10만)을 쓴다 — 계산기에서는
    "환급 0원"이라는 그럴듯한 오답으로 나온다.
    """

    @classmethod
    def setUpClass(cls):
        text = SEED.read_text(encoding="utf-8")
        start = text.index("-- 반값여행 지역별 override")
        cls.block = text[start : text.index(") as v(", start)]
        cls.codes = re.findall(r"\('(\d{5})',\s*\d+,", cls.block)
        # support_region에 반값여행으로 걸린 지역 코드
        cls.mapped = set(
            re.findall(r"\('대한민국 반값여행', '(\d{5})'\)", text)
        )

    def test_override_rows_are_found(self):
        self.assertGreater(len(self.codes), 3)
        self.assertGreater(len(self.mapped), 20)

    def test_every_override_region_is_mapped_to_the_support(self):
        for code in self.codes:
            with self.subTest(region=code):
                self.assertIn(
                    code,
                    self.mapped,
                    "override에 적힌 지역이 반값여행 대상 목록에 없다."
                    " join이 0행이 되어 이 override는 아무 일도 하지 않는다.",
                )

    def test_regions_with_a_confirmed_lower_minimum_have_an_override(self):
        """공지에서 최소 소비가 기본(10만)보다 낮다고 확인된 지역은 override가 있어야 한다.

        화천이 빠져 있어 7만~9만 9,999원 구간이 환급 0원으로 계산됐다. 계산기 쪽
        테스트는 합성 행만 보므로 이 누락을 잡지 못한다 — 버그가 난 층이 시드라
        시드에서 잡는다.

        아래 목록은 공지에서 금액을 직접 확인한 것만 담는다. 지역을 추가할 때
        공지에 10만이 아닌 금액이 적혀 있으면 여기에 함께 적을 것.
        """
        confirmed = {"51790": 70000}  # 화천: '여행경비 최소 7만원 이상 결제'
        found = {code: int(amount) for code, amount in re.findall(r"\('(\d{5})',\s*(\d+),", self.block)}
        for code, expected in confirmed.items():
            with self.subTest(region=code):
                self.assertEqual(
                    found.get(code),
                    expected,
                    f"{code}의 최소 소비 override가 없거나 값이 다르다."
                    " 빠지면 기본 10만이 걸려 환급이 0원으로 계산된다.",
                )

    def test_no_duplicate_override_region(self):
        # 같은 지역에 두 줄이면 규칙이 둘 다 살아남아 계산이 갈린다
        self.assertCountEqual(self.codes, set(self.codes))


class TestSupportScheduleSeed(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = _rows()

    def test_seed_rows_are_found(self):
        # 정규식이 안 맞으면 아래 검사가 전부 조용히 통과해버린다
        self.assertGreater(len(self.rows), 20)

    def test_every_schedule_row_is_parsed(self):
        # 행 수가 아니라 '검사된 행 수'를 본다. 정규식에 안 걸리는 행이 하나라도
        # 있으면 그 행은 아래 형식 검사를 전부 건너뛴 채 통과한다.
        self.assertEqual(len(self.rows), _block().count(SCHEDULE_ROW_PREFIX))

    def test_pre_approval_rounds_always_have_a_travel_end(self):
        # 검사 범위는 반값여행뿐이다(ROW가 그 제목으로 고정). 지금 차수를 가진 제도가
        # 그것뿐이라 맞지만, 다른 제도에 차수가 생기면 ROW부터 넓혀야 한다.
        #
        # 반값여행은 is_pre_approval = true고 제도 종료일도 없다(end_date null).
        # 그런 차수를 닫는 유일한 조건이 _ACTIVE_PREDICATE의 travel_end 게이트라,
        # travel_end가 비면 apply_end도 없는 차수가 영원히 활성으로 남는다.
        for code, rnd, _start, _end, travel_end, _status in self.rows:
            with self.subTest(region=code, round=rnd):
                self.assertNotEqual(
                    travel_end,
                    "null",
                    "사전 신청 제도의 차수는 travel_end를 반드시 적어야 한다."
                    " 없으면 그 차수를 닫을 방법이 없다.",
                )

    def test_apply_times_have_clock_time_and_kst_offset(self):
        for code, rnd, start, end, _travel_end, _status in self.rows:
            for label, value in (("apply_start", start), ("apply_end", end)):
                if value == "null":
                    continue
                with self.subTest(region=code, round=rnd, field=label):
                    self.assertRegex(
                        value,
                        STAMP,
                        f"{value} — 시각과 +09를 함께 적어야 한다."
                        " 날짜만 적으면 그날 0시가 되어 마감일이 빠진다.",
                    )

    def test_apply_start_is_not_after_apply_end(self):
        # 완도 3차가 시작 10:00, 종료 그날 0시로 적혀 있어 어떤 시각에도 활성이 될 수 없었다
        for code, rnd, start, end, _travel_end, _status in self.rows:
            with self.subTest(region=code, round=rnd):
                self.assertIsNone(_inverted(code, rnd, start, end))

    def test_no_non_kst_offset(self):
        # 주석에 예시로 적힌 오프셋까지 세지 않도록 따옴표 안의 값만 본다
        offsets = set(re.findall(r"'\d{4}-\d{2}-\d{2}[^']*(\+\d{2})'", _block()))
        self.assertEqual(offsets - {"+09"}, set(), "한국 시간(+09) 외의 오프셋이 섞여 있다")


class TestInvertedWindowDetection(unittest.TestCase):
    """위 검사가 실제로 뒤집힌 값을 잡는지 본다.

    시드에서 시작·종료가 둘 다 적힌 행은 몇 건뿐이라(대부분 한쪽만 공지된다), 위
    검사가 실제로 비교를 몇 번 하는지는 데이터에 달려 있다. 한 건도 없던 때도 있었고
    그때는 검사가 통과만 하고 아무 일도 하지 않았다. 고정 사례로 판정 함수 자체를
    확인해 두면 데이터가 어떻든 이 검사가 일한다는 게 보장된다.
    """

    def test_detects_end_before_start(self):
        # 완도 3차가 실제로 이랬다: 시작 10:00, 종료 그날 0시
        self.assertIsNotNone(
            _inverted("12850", 3, "'2026-06-26 10:00+09'", "'2026-06-26 00:00+09'")
        )

    def test_accepts_end_after_start(self):
        self.assertIsNone(
            _inverted("12850", 3, "'2026-06-26 10:00+09'", "'2026-06-26 23:59:59+09'")
        )

    def test_accepts_equal_edges(self):
        stamp = "'2026-06-26 10:00+09'"
        self.assertIsNone(_inverted("12850", 3, stamp, stamp))

    def test_ignores_rows_without_both_values(self):
        self.assertIsNone(_inverted("12850", 3, "null", "'2026-06-26 23:59:59+09'"))
        self.assertIsNone(_inverted("12850", 3, "'2026-06-26 10:00+09'", "null"))


if __name__ == "__main__":
    unittest.main()
