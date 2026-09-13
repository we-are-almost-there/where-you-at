// 제한된 마크다운 파서 테스트.
//
// 공지·FAQ 본문은 Supabase 콘솔에서 미리보기 없이 쓰므로, 규칙을 조금 어긋나게 써도 글이 사라지거나
// 엉뚱하게 링크가 되지 않는지를 함께 본다. 화면 요소로 그리는 부분은 HelpMarkdown이 맡는다.
import { describe, expect, it } from "vitest";
import { isSafeHref, parseInlines, parseMarkdown } from "./markdown";

const text = (value: string) => ({ type: "text" as const, text: value });

describe("parseMarkdown", () => {
  it("빈 줄로 문단을 나누고, 문단 안의 줄바꿈 한 번은 공백으로 잇는다", () => {
    expect(parseMarkdown("첫 줄\n이어지는 줄\n\n둘째 문단")).toEqual([
      { type: "paragraph", inlines: [text("첫 줄 이어지는 줄")] },
      { type: "paragraph", inlines: [text("둘째 문단")] },
    ]);
  });

  it("'- '로 시작하는 줄은 목록 항목이 된다", () => {
    expect(parseMarkdown("- 하나\n- **둘**")).toEqual([
      {
        type: "list",
        items: [
          { inlines: [text("하나")], children: [] },
          { inlines: [{ type: "bold", text: "둘" }], children: [] },
        ],
      },
    ]);
  });

  it("두 칸 들여쓴 '- ' 줄은 바로 위 항목의 하위 항목이 된다", () => {
    expect(parseMarkdown("- 코스 탐색\n  - 코스 따라가기\n  - 기록 카드\n- 대회 행사")).toEqual([
      {
        type: "list",
        items: [
          { inlines: [text("코스 탐색")], children: [[text("코스 따라가기")], [text("기록 카드")]] },
          { inlines: [text("대회 행사")], children: [] },
        ],
      },
    ]);
  });

  it("더 깊게 들여쓰거나 탭으로 들여써도 한 단계 하위 항목으로 본다", () => {
    expect(parseMarkdown("- 상위\n      - 깊은 하위\n\t- 탭 하위")).toEqual([
      {
        type: "list",
        items: [{ inlines: [text("상위")], children: [[text("깊은 하위")], [text("탭 하위")]] }],
      },
    ]);
  });

  it("목록 첫 줄이 들여써져 있으면 매달 곳이 없으니 상위 항목으로 둔다", () => {
    expect(parseMarkdown("  - 들여쓴 첫 줄\n  - 둘째 줄")).toEqual([
      {
        type: "list",
        items: [{ inlines: [text("들여쓴 첫 줄")], children: [[text("둘째 줄")]] }],
      },
    ]);
  });

  it("빈 줄 없이 문단 바로 아래에 쓴 목록도 문단과 목록으로 나눈다", () => {
    expect(parseMarkdown("기능은 다음과 같습니다.\n- 코스 탐색\n- 자전거 대여")).toEqual([
      { type: "paragraph", inlines: [text("기능은 다음과 같습니다.")] },
      {
        type: "list",
        items: [
          { inlines: [text("코스 탐색")], children: [] },
          { inlines: [text("자전거 대여")], children: [] },
        ],
      },
    ]);
  });

  it("CRLF 줄바꿈과 공백만 있는 빈 줄도 문단 구분으로 본다", () => {
    expect(parseMarkdown("가\r\n  \r\n나")).toEqual([
      { type: "paragraph", inlines: [text("가")] },
      { type: "paragraph", inlines: [text("나")] },
    ]);
  });

  it("내용이 없으면 블록도 없다", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n")).toEqual([]);
  });

  it("허용하지 않는 문법은 해석하지 않고 글자 그대로 둔다", () => {
    expect(parseMarkdown("# 제목\n\n<b>굵게</b>")).toEqual([
      { type: "paragraph", inlines: [text("# 제목")] },
      { type: "paragraph", inlines: [text("<b>굵게</b>")] },
    ]);
  });
});

describe("parseInlines", () => {
  it("굵게와 링크를 앞뒤 글자와 함께 나눈다", () => {
    expect(parseInlines("앞 **굵게** 중간 [링크](https://example.com) 뒤")).toEqual([
      text("앞 "),
      { type: "bold", text: "굵게" },
      text(" 중간 "),
      { type: "link", text: "링크", href: "https://example.com" },
      text(" 뒤"),
    ]);
  });

  it("허용하지 않는 주소는 링크를 만들지 않고 글자만 남긴다", () => {
    expect(parseInlines("[눌러 보세요](javascript:alert)")).toEqual([text("눌러 보세요")]);
    expect(parseInlines("[외부](//evil.example)")).toEqual([text("외부")]);
  });

  it("닫히지 않은 **는 글자 그대로 둔다", () => {
    expect(parseInlines("**열기만 했어요")).toEqual([text("**열기만 했어요")]);
  });
});

describe("isSafeHref", () => {
  it.each([
    ["/faq", true],
    ["https://www.data.go.kr", true],
    ["http://example.com", true],
    ["mailto:help@example.com", true],
    ["//evil.example", false],
    ["javascript:alert", false],
    ["ftp://example.com", false],
    ["faq", false],
  ])("%s → %s", (href, expected) => {
    expect(isSafeHref(href)).toBe(expected);
  });
});
