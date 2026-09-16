// @vitest-environment jsdom
//
// 공지사항 목록이 API 응답을 화면 상태(목록·빈 상태·에러)로 옮기는지 본다.
// 정렬과 공개 조건은 서버가 맡으므로, 여기서는 받은 순서를 그대로 그리는지만 확인한다.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkError } from "../../lib/http";
import NoticeList from "./NoticeList";
import { fetchNotices } from "./helpApi";

vi.mock("./helpApi", () => ({ fetchNotices: vi.fn() }));
// AppHeader는 ResizeObserver 같은 브라우저 API를 써서 jsdom에서 그릴 수 없고, 이 테스트의 대상도 아니다.
vi.mock("../../components/layout/AppHeader", () => ({ default: () => null }));
// 푸터에도 고객지원 링크가 있어, 그리면 제목 위 뒤로가기 링크를 이름으로 찾을 수 없다.
vi.mock("../../components/layout/Footer", () => ({ default: () => null }));

const mockedFetch = vi.mocked(fetchNotices);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/notices" element={<NoticeList />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NoticeList", () => {
  it("받은 순서대로 그리고, 고정 공지에만 표시를 붙이고, 상세로 연결한다", async () => {
    mockedFetch.mockResolvedValue({
      total: 2,
      page: 1,
      per_page: 10,
      items: [
        { id: 7, title: "첫 공지", is_pinned: true, published_at: "2026-09-01T12:00:00Z" },
        { id: 9, title: "둘째 공지", is_pinned: false, published_at: "2026-09-10T12:00:00Z" },
      ],
    });

    renderAt("/notices");

    // 제목 위의 고객지원 링크를 빼고 목록 안의 링크만 본다.
    const list = await screen.findByRole("list");
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/notices/7", "/notices/9"]);
    expect(links[0].textContent).toContain("고정");
    expect(links[0].textContent).toContain("2026.09.01");
    expect(links[1].textContent).not.toContain("고정");
    expect(mockedFetch).toHaveBeenCalledWith({ page: 1, perPage: 10 });
  });

  it("주소의 ?page= 값으로 해당 페이지를 요청한다", async () => {
    mockedFetch.mockResolvedValue({ total: 0, page: 2, per_page: 10, items: [] });

    renderAt("/notices?page=2");

    await screen.findByText("등록된 공지사항이 없어요.");
    expect(mockedFetch).toHaveBeenCalledWith({ page: 2, perPage: 10 });
  });

  it("제목 위에 고객지원으로 돌아가는 링크를 둔다", async () => {
    mockedFetch.mockResolvedValue({ total: 0, page: 1, per_page: 10, items: [] });

    renderAt("/notices");

    const back = await screen.findByRole("link", { name: "고객지원" });
    expect(back.getAttribute("href")).toBe("/help");
  });

  it("공지는 있는데 범위를 벗어난 페이지면 첫 페이지로 가는 링크를 보여준다", async () => {
    mockedFetch.mockResolvedValue({ total: 3, page: 5, per_page: 10, items: [] });

    renderAt("/notices?page=5");

    await screen.findByText("이 페이지에는 공지사항이 없어요.");
    expect(screen.getByRole("link", { name: "첫 페이지로" }).getAttribute("href")).toBe("/notices");
  });

  it("조회에 실패하면 에러를 보여주고, 다시 시도하면 다시 요청한다", async () => {
    mockedFetch
      .mockRejectedValueOnce(new NetworkError(new TypeError("Failed to fetch")))
      .mockResolvedValueOnce({ total: 0, page: 1, per_page: 10, items: [] });

    renderAt("/notices");

    await screen.findByText("서버에 연결할 수 없어요");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await screen.findByText("등록된 공지사항이 없어요.");
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });
});
