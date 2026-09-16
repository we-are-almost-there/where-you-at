// @vitest-environment jsdom
//
// 푸터 링크가 지금 보는 화면을 가리키면 맨 위로 올리는지 본다. 경로가 그대로라
// ScrollToTop이 움직이지 않는 경우를 푸터가 직접 맡는다.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Footer from "./Footer";

const scrollTo = vi.fn();

beforeEach(() => {
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});

afterEach(() => {
  cleanup();
  scrollTo.mockReset();
});

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Footer />
    </MemoryRouter>,
  );
}

describe("Footer", () => {
  it("지금 보는 화면의 링크를 누르면 맨 위로 올린다", () => {
    renderAt("/help");

    fireEvent.click(screen.getByRole("link", { name: "고객지원" }));

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("다른 화면의 링크는 올리지 않고 ScrollToTop에 맡긴다", () => {
    renderAt("/help");

    fireEvent.click(screen.getByRole("link", { name: "이용약관" }));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("링크 묶음에 이름을 붙여 다른 nav와 구분한다", () => {
    renderAt("/");

    const nav = screen.getByRole("navigation", { name: "약관 및 고객지원" });
    expect(nav.querySelectorAll("a")).toHaveLength(3);
  });
});
