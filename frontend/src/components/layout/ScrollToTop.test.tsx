// @vitest-environment jsdom
//
// 화면 이동 때 스크롤을 맨 위로 올리는 조건을 본다. 경로가 바뀔 때만 올리고, 같은 화면에서
// 쿼리를 다시 넣거나 바꾸는 조작과 뒤로가기에는 관여하지 않아야 한다.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate, useSearchParams } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScrollToTop from "./ScrollToTop";
import { MAIN_CONTENT_ID } from "./mainContent";

const scrollTo = vi.fn();

beforeEach(() => {
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});

afterEach(() => {
  cleanup();
  scrollTo.mockReset();
  vi.restoreAllMocks();
});

// 버튼마다 한 가지 이동을 일으킨다. 지금 주소는 문단으로 보여 준다.
// 실제 화면처럼 본문(main)을 두어 초점 이동도 확인한다.
function Controls() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = params.get("page") ?? "";
  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1}>
      <p>page={page}</p>
      <button onClick={() => navigate("/privacy")}>경로 이동</button>
      <button onClick={() => setParams({ page })}>같은 쿼리 push</button>
      <button onClick={() => setParams({ page }, { replace: true })}>같은 쿼리 replace</button>
      <button onClick={() => setParams({ page: "2" })}>다른 쿼리</button>
      <button onClick={() => navigate(-1)}>뒤로</button>
    </main>
  );
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ScrollToTop />
      <Routes>
        <Route path="*" element={<Controls />} />
      </Routes>
    </MemoryRouter>,
  );
  // 첫 렌더는 이동이 아니라 올리지 않는다.
  expect(scrollTo).not.toHaveBeenCalled();
}

const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("ScrollToTop", () => {
  it("경로가 바뀌면 맨 위로 올린다", () => {
    renderAt("/terms");

    click("경로 이동");

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it.each(["같은 쿼리 push", "같은 쿼리 replace"])("%s는 위치를 그대로 둔다", (name) => {
    renderAt("/bicycle-facilities?page=1");

    click(name);

    expect(screen.getByText("page=1")).toBeTruthy();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("다른 쿼리로 바꿔도 위치를 그대로 둔다", () => {
    renderAt("/bicycle-facilities?page=1");

    click("다른 쿼리");

    expect(screen.getByText("page=2")).toBeTruthy();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("경로가 바뀌면 새 화면의 본문으로 초점을 옮기되 스크롤은 초점이 정하지 않는다", () => {
    renderAt("/terms");
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    screen.getByRole("button", { name: "경로 이동" }).focus();

    click("경로 이동");

    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it.each(["", "sr-only"])("렌더링되는 제목(%s)에 한 번만 초점을 옮긴다", (className) => {
    renderAt("/terms");
    const heading = document.createElement("h1");
    heading.textContent = "페이지 제목";
    heading.className = className;
    // jsdom은 레이아웃을 계산하지 않는다. sr-only도 브라우저에서는 영역이 있다.
    vi.spyOn(heading, "getClientRects").mockReturnValue([new DOMRect(0, 0, 1, 1)] as unknown as DOMRectList);
    screen.getByRole("main").prepend(heading);
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    try {
      click("경로 이동");

      expect(document.activeElement).toBe(heading);
      expect(focus).toHaveBeenCalledTimes(1);
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    } finally {
      focus.mockRestore();
    }
  });

  it("제목의 부모가 숨겨져 영역이 없으면 본문에 한 번만 초점을 옮긴다", () => {
    renderAt("/terms");
    const wrapper = document.createElement("div");
    wrapper.style.display = "none";
    const heading = document.createElement("h1");
    heading.textContent = "숨겨진 제목";
    wrapper.append(heading);
    const main = screen.getByRole("main");
    main.prepend(wrapper);
    vi.spyOn(heading, "getClientRects").mockReturnValue([] as unknown as DOMRectList);
    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    click("경로 이동");

    expect(document.activeElement).toBe(main);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("쿼리만 바뀌면 조작하던 컨트롤에 초점을 남긴다", () => {
    renderAt("/bicycle-facilities?page=1");
    const button = screen.getByRole("button", { name: "다른 쿼리" });
    button.focus();

    click("다른 쿼리");

    expect(document.activeElement).toBe(button);
  });

  it("뒤로가기도 본문으로 초점을 옮기지만 스크롤은 브라우저 복원에 맡긴다", () => {
    renderAt("/terms");
    click("경로 이동");
    scrollTo.mockClear();
    screen.getByRole("button", { name: "뒤로" }).focus();

    click("뒤로");

    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("뒤로가기에는 관여하지 않는다", () => {
    renderAt("/terms");
    click("경로 이동");
    scrollTo.mockClear();

    click("뒤로");

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
