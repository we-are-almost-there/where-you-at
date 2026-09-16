// @vitest-environment jsdom
//
// 화면 이동 때 스크롤을 맨 위로 올리는 조건을 본다. 경로가 바뀔 때만 올리고, 같은 화면에서
// 쿼리를 다시 넣거나 바꾸는 조작과 뒤로가기에는 관여하지 않아야 한다.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate, useSearchParams } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScrollToTop from "./ScrollToTop";

const scrollTo = vi.fn();

beforeEach(() => {
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
});

afterEach(() => {
  cleanup();
  scrollTo.mockReset();
});

// 버튼마다 한 가지 이동을 일으킨다. 지금 주소는 문단으로 보여 준다.
function Controls() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = params.get("page") ?? "";
  return (
    <>
      <p>page={page}</p>
      <button onClick={() => navigate("/privacy")}>경로 이동</button>
      <button onClick={() => setParams({ page })}>같은 쿼리 push</button>
      <button onClick={() => setParams({ page }, { replace: true })}>같은 쿼리 replace</button>
      <button onClick={() => setParams({ page: "2" })}>다른 쿼리</button>
      <button onClick={() => navigate(-1)}>뒤로</button>
    </>
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

  it("뒤로가기에는 관여하지 않는다", () => {
    renderAt("/terms");
    click("경로 이동");
    scrollTo.mockClear();

    click("뒤로");

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
