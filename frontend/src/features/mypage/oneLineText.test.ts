import { describe, expect, it } from "vitest";
import { charLength, limitInput, toOneLine } from "./oneLineText";

describe("oneLineText", () => {
  it("저장할 값은 앞뒤 공백을 지우고 연속 공백을 한 칸으로 줄인다", () => {
    expect(toOneLine("  안녕하세요!!     러닝 좋아요 ")).toBe("안녕하세요!! 러닝 좋아요");
  });

  it("입력 중인 값은 연속 공백만 줄이고 끝 공백은 남긴다", () => {
    expect(limitInput("러닝   ", 40)).toBe("러닝 ");
  });

  it("최대 글자에서 자른다", () => {
    expect(limitInput("가".repeat(45), 40)).toBe("가".repeat(40));
  });

  it("이모지는 한 글자로 세고, 자를 때 반으로 쪼개지 않는다", () => {
    expect(charLength("러닝🏃")).toBe(3);
    expect(limitInput("가".repeat(39) + "🏃🏃", 40)).toBe("가".repeat(39) + "🏃");
  });
});
