import { describe, expect, it } from "vitest";
import { formatNoticeDate, groupFaqs, parseNoticeId, parsePage } from "./helpFormat";
import type { Faq } from "./types";

describe("formatNoticeDate", () => {
  it("ISO 시각을 YYYY.MM.DD로 바꾼다", () => {
    // 한국·UTC·미국 어느 시간대에서 돌려도 같은 날짜가 나오도록 UTC 정오를 쓴다.
    expect(formatNoticeDate("2026-09-04T12:00:00Z")).toBe("2026.09.04");
  });

  it("해석할 수 없는 값이면 빈 문자열", () => {
    expect(formatNoticeDate("잘못된 날짜")).toBe("");
  });
});

describe("groupFaqs", () => {
  const faq = (id: number, category: string): Faq => ({ id, category, question: `질문 ${id}`, answer: "답" });

  it("API가 준 순서대로 카테고리를 묶는다", () => {
    const groups = groupFaqs([faq(1, "코스 탐색"), faq(2, "코스 탐색"), faq(3, "이용 안내")]);
    expect(groups.map((g) => [g.category, g.items.map((item) => item.id)])).toEqual([
      ["코스 탐색", [1, 2]],
      ["이용 안내", [3]],
    ]);
  });

  it("같은 카테고리가 떨어져서 나오면 처음 나온 묶음에 합친다", () => {
    const groups = groupFaqs([faq(1, "가"), faq(2, "나"), faq(3, "가")]);
    expect(groups.map((g) => [g.category, g.items.map((item) => item.id)])).toEqual([
      ["가", [1, 3]],
      ["나", [2]],
    ]);
  });

  it("빈 목록이면 묶음도 없다", () => {
    expect(groupFaqs([])).toEqual([]);
  });
});

describe("parsePage", () => {
  it.each([
    [null, 1],
    ["3", 3],
    ["0", 1],
    ["-2", 1],
    ["1.5", 1],
    ["abc", 1],
  ])("%s → %s", (value, expected) => {
    expect(parsePage(value)).toBe(expected);
  });
});

describe("parseNoticeId", () => {
  it.each([
    ["12", 12],
    ["0", null],
    ["01", null],
    ["-1", null],
    ["1.5", null],
    ["abc", null],
    [undefined, null],
    // 안전 정수의 끝까지는 그대로, 넘으면 반올림·Infinity가 되므로 null
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
    ["9007199254740992", null],
    ["1".repeat(400), null],
  ])("%s → %s", (value, expected) => {
    expect(parseNoticeId(value)).toBe(expected);
  });
});
