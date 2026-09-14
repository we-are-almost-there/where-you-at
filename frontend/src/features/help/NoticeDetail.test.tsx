// @vitest-environment jsdom
//
// 공지 상세가 id 형식, 404, 연결 실패를 각각 알맞은 화면으로 바꾸는지와,
// '목록으로'가 보던 목록 페이지로 돌아가는지 본다.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, NetworkError } from "../../lib/http";
import NoticeDetail from "./NoticeDetail";
import { fetchNotice } from "./helpApi";

vi.mock("./helpApi", () => ({ fetchNotice: vi.fn() }));
// AppHeader는 ResizeObserver 같은 브라우저 API를 써서 jsdom에서 그릴 수 없고, 이 테스트의 대상도 아니다.
vi.mock("../../components/layout/AppHeader", () => ({ default: () => null }));

const mockedFetch = vi.mocked(fetchNotice);

function renderAt(entry: string | { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/notices/:id" element={<NoticeDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const notice = {
  id: 3,
  title: "점검 안내",
  is_pinned: false,
  published_at: "2026-09-04T12:00:00Z",
  content: "**중요** 안내입니다.\n\n- 첫 항목",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NoticeDetail", () => {
  it("id 형식이 맞지 않으면 요청 없이 찾을 수 없음을 보여준다", () => {
    renderAt("/notices/abc");

    expect(screen.getByText("공지사항을 찾을 수 없어요")).toBeTruthy();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("서버가 404를 주면 찾을 수 없음을 보여준다", async () => {
    mockedFetch.mockRejectedValue(new HttpError(404, "공지사항 상세 조회 실패 (404)"));

    renderAt("/notices/5");

    await screen.findByText("공지사항을 찾을 수 없어요");
    expect(mockedFetch).toHaveBeenCalledWith(5);
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });

  it("연결에 실패하면 다시 시도와 목록으로를 함께 보여준다", async () => {
    mockedFetch.mockRejectedValue(new NetworkError(new TypeError("Failed to fetch")));

    renderAt("/notices/5");

    await screen.findByText("서버에 연결할 수 없어요");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "목록으로" })).toBeTruthy();
  });

  it("제목, 게시일, 마크다운 본문을 그린다", async () => {
    mockedFetch.mockResolvedValue(notice);

    const { container } = renderAt("/notices/3");

    await screen.findByRole("heading", { name: "점검 안내" });
    expect(container.querySelector("time")?.textContent).toBe("2026.09.04");
    expect(container.querySelector("strong")?.textContent).toBe("중요");
    expect(screen.getByRole("listitem").textContent).toBe("첫 항목");
    expect(screen.getByRole("link", { name: "목록으로" }).getAttribute("href")).toBe("/notices");
  });

  it("제목 위 링크와 목록으로 버튼 모두 목록에서 넘겨준 페이지로 돌아간다", async () => {
    mockedFetch.mockResolvedValue(notice);

    renderAt({ pathname: "/notices/3", state: { listSearch: "?page=2" } });

    const back = await screen.findByRole("link", { name: "목록으로" });
    expect(back.getAttribute("href")).toBe("/notices?page=2");
    expect(screen.getByRole("link", { name: "공지사항" }).getAttribute("href")).toBe("/notices?page=2");
  });
});
