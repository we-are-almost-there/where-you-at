// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import AppHeader from "./AppHeader";
import { MAIN_CONTENT_ID } from "./mainContent";

beforeAll(() => {
  // 헤더가 스크롤바 폭 보정에 쓰는 API. jsdom에는 없다.
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

afterEach(cleanup);

function LocationProbe() {
  const { pathname, hash } = useLocation();
  return <output data-testid="location">{pathname + hash}</output>;
}

describe("AppHeader 주요 메뉴", () => {
  it("지금 보는 페이지의 메뉴에만 aria-current=page를 둔다", () => {
    render(
      <MemoryRouter initialEntries={["/races"]}>
        <AppHeader />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
    const current = [...nav.querySelectorAll("[aria-current]")];
    expect(current.map((link) => [link.textContent, link.getAttribute("aria-current")])).toEqual([
      ["대회 행사", "page"],
    ]);
  });
});

describe("AppHeader 하위 경로의 현재 메뉴", () => {
  it.each([
    ["/courses/1", "코스 탐색"],
    ["/courses/1/", "코스 탐색"],
    ["/courses", "코스 탐색"],
    ["/", "홈"],
  ])("%s에서는 %s만 현재 페이지다", (path, label) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppHeader />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect([...nav.querySelectorAll('[aria-current="page"]')].map((link) => link.textContent)).toEqual([label]);
  });

  it("비슷하게 시작하는 다른 경로는 현재 메뉴로 보지 않는다", () => {
    render(
      <MemoryRouter initialEntries={["/courses-archive"]}>
        <AppHeader />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });
});

describe("AppHeader 본문 바로가기", () => {
  it("헤더에서 가장 먼저 나오는 링크다", () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("link")[0].textContent).toBe("본문 바로가기");
  });

  it("누르면 주소를 바꾸지 않고 본문으로 초점을 옮긴다", () => {
    render(
      <MemoryRouter initialEntries={["/courses"]}>
        <AppHeader />
        <main id={MAIN_CONTENT_ID} tabIndex={-1}>
          본문
        </main>
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "본문 바로가기" }));

    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(screen.getByTestId("location").textContent).toBe("/courses");
  });
});
