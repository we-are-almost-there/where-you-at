// @vitest-environment jsdom
//
// FAQ 페이지가 API 순서대로 카테고리를 묶어 그리는지, 답변 마크다운의 링크를 그리는지,
// 빈 상태와 에러를 보여주는지 본다. 카테고리 순서 자체는 서버 정렬이 정한다.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkError } from "../../lib/http";
import FaqPage from "./FaqPage";
import { fetchFaqs } from "./helpApi";

vi.mock("./helpApi", () => ({ fetchFaqs: vi.fn() }));
// AppHeader는 ResizeObserver 같은 브라우저 API를 써서 jsdom에서 그릴 수 없고, 이 테스트의 대상도 아니다.
vi.mock("../../components/layout/AppHeader", () => ({ default: () => null }));

const mockedFetch = vi.mocked(fetchFaqs);

function renderPage() {
  return render(
    <MemoryRouter>
      <FaqPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FaqPage", () => {
  it("API가 준 순서대로 카테고리를 묶어 그린다", async () => {
    mockedFetch.mockResolvedValue([
      { id: 1, category: "카테고리 B", question: "질문 1", answer: "답 1" },
      { id: 2, category: "카테고리 B", question: "질문 2", answer: "답 2" },
      { id: 3, category: "카테고리 A", question: "질문 3", answer: "답 3" },
    ]);

    renderPage();

    await screen.findByText("질문 1");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["카테고리 B", "카테고리 A"]);

    const sections = screen.getAllByRole("region");
    expect(sections[0].textContent).toContain("질문 2");
    expect(sections[1].textContent).toContain("질문 3");
    expect(sections[1].textContent).not.toContain("질문 1");
  });

  it("답변의 마크다운 링크를 사이트 안 링크로 그린다", async () => {
    mockedFetch.mockResolvedValue([
      { id: 1, category: "이용 안내", question: "공지는 어디서 보나요?", answer: "[공지사항](/notices)에서 확인하세요." },
    ]);

    const { container } = renderPage();

    await screen.findByText("공지는 어디서 보나요?");
    expect(container.querySelector('a[href="/notices"]')?.textContent).toBe("공지사항");
  });

  it("질문이 없으면 빈 상태 문구를 보여준다", async () => {
    mockedFetch.mockResolvedValue([]);

    renderPage();

    await screen.findByText("등록된 질문이 없어요.");
  });

  it("제목 위에 고객지원으로 돌아가는 링크를 둔다", async () => {
    mockedFetch.mockResolvedValue([]);

    renderPage();

    const back = await screen.findByRole("link", { name: "고객지원" });
    expect(back.getAttribute("href")).toBe("/help");
  });

  it("조회에 실패하면 에러를 보여주고, 다시 시도하면 다시 요청한다", async () => {
    mockedFetch.mockRejectedValueOnce(new NetworkError(new TypeError("Failed to fetch"))).mockResolvedValueOnce([]);

    renderPage();

    await screen.findByText("서버에 연결할 수 없어요");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await screen.findByText("등록된 질문이 없어요.");
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });
});
