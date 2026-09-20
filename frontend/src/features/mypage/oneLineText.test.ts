import { describe, expect, it } from "vitest";
import { charLength, inputLength, limitInput, toOneLine } from "./oneLineText";

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

  it("카운터 글자 수는 입력 제한과 같은 기준이라, 막히는 순간 정확히 최대가 된다", () => {
    const nickname = "가".repeat(19) + " ";

    // 끝 공백까지 세어 20. 다음 글자가 들어오면 단어 사이 공백이 되어 21자이므로 막힌다.
    expect(inputLength(nickname)).toBe(20);
    expect(limitInput(nickname + "나", 20)).toBe(nickname);
    // 연속 공백은 한 칸으로 센다.
    expect(inputLength("러닝   좋아요")).toBe(6);
  });

  // 서버(schemas/user.py _one_line)와 같은 기준. 문자는 눈에 보이지 않아 이스케이프로 적는다.
  it("결합 이모지에 쓰이는 ZWJ·태그 문자는 남긴다", () => {
    const developer = "\u{1F468}‍\u{1F4BB}"; // 사람+ZWJ+노트북
    const scotland = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}"; // 태그 문자 깃발

    expect(toOneLine(`러닝 ${developer}`)).toBe(`러닝 ${developer}`);
    expect(toOneLine(scotland)).toBe(scotland);
    // 서버처럼 코드포인트 단위로 센다.
    expect(charLength(developer)).toBe(3);
  });

  it("줄바꿈 없는 공백·전각 공백은 일반 공백으로 바꾼다", () => {
    expect(toOneLine(" 길 　손　")).toBe("길 손");
    expect(limitInput("러닝 ", 40)).toBe("러닝 ");
  });

  it("서버가 막는 보이지 않는 문자는 입력 단계에서 지운다", () => {
    // 폭 없는 공백, 글자 방향 뒤집기, 줄 구분자, 사용자 정의 영역
    expect(limitInput("길​‮ 손", 40)).toBe("길손");
    expect(inputLength("길​손")).toBe(2);
  });
});
