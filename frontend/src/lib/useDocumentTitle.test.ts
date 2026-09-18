// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDocumentTitle } from "./useDocumentTitle";

describe("useDocumentTitle", () => {
  it("페이지 이름 뒤에 서비스 이름을 붙인다", () => {
    renderHook(() => useDocumentTitle("코스 탐색"));

    expect(document.title).toBe("코스 탐색 | 어디까지왔니");
  });

  it("페이지 이름이 없으면 서비스 이름만 쓴다", () => {
    renderHook(() => useDocumentTitle(undefined));

    expect(document.title).toBe("어디까지왔니");
  });

  it("페이지 이름이 바뀌면 제목도 바꾼다", () => {
    const { rerender } = renderHook(({ title }) => useDocumentTitle(title), {
      initialProps: { title: null as string | null },
    });

    rerender({ title: "남파랑길 6코스" });

    expect(document.title).toBe("남파랑길 6코스 | 어디까지왔니");
  });
});
