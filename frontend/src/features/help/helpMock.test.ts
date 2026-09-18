// 목 데이터(helpMock)의 FAQ가 운영 문구의 기준(backend/sql/04_help_seed.sql)과 어긋나지 않는지 본다.
// 목에는 화면 확인용 예시 FAQ도 있어서, 시드와 질문이 같은 항목만 답이 같은지 비교한다.
// 예: 로그인 기능이 생겼는데 한쪽에만 "로그인 없이 모든 기능을 이용할 수 있습니다"가 남는 일을 막는다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mockFaqs } from "./helpMock";

const SEED_PATH = resolve(__dirname, "../../../../backend/sql/04_help_seed.sql");

/** 시드의 FAQ 값 목록 ('카테고리', '질문', E'답', 순서)에서 질문 → 답을 읽는다. */
function seedFaqAnswers(): Map<string, string> {
  const sql = readFileSync(SEED_PATH, "utf-8");
  const pattern = /\(\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*E'((?:[^']|'')*)',\s*\d+\s*\)/g;
  const unquote = (value: string) => value.replace(/''/g, "'");
  const answers = new Map<string, string>();
  for (const [, , question, answer] of sql.matchAll(pattern)) {
    answers.set(unquote(question), unquote(answer).replace(/\\n/g, "\n"));
  }
  return answers;
}

describe("helpMock", () => {
  it("시드와 질문이 같은 FAQ는 답도 시드와 같다", () => {
    const seed = seedFaqAnswers();
    const shared = mockFaqs.filter((faq) => seed.has(faq.question));

    // 비교할 항목이 하나도 없으면 정규식이 시드 형식을 못 읽은 것이다.
    expect(shared.length).toBeGreaterThan(0);
    for (const faq of shared) {
      expect(faq.answer, faq.question).toBe(seed.get(faq.question));
    }
  });

  it("회원가입 FAQ는 마이페이지에 로그인이 필요하다고 안내한다", () => {
    const answer = seedFaqAnswers().get("회원가입이 필요한가요?");

    expect(answer).toContain("마이페이지");
    expect(answer).toContain("카카오 로그인");
    expect(answer).not.toContain("모든 기능을 이용할 수 있습니다");
  });
});
