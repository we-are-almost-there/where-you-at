// @vitest-environment jsdom
//
// 내 기록 전체 보기가 기록·기록 카드를 탭으로 나누고, 탭마다 페이지를 나누며, 탭을 바꾸면 1쪽으로 돌아가는지 본다.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../auth";
import RecordsPage from "./RecordsPage";
import { getRecordCards, getRecords } from "./mypageData";
import type { RunRecord, SavedRecordCard } from "./types";

vi.mock("../auth", () => ({ useAuth: vi.fn(), startKakaoLogin: vi.fn() }));
vi.mock("./mypageData", () => ({ getRecords: vi.fn(), getRecordCards: vi.fn() }));
vi.mock("../../components/layout/AppHeader", () => ({ default: () => null }));

const record = (id: number): RunRecord => ({
  id,
  courseId: id,
  courseName: `코스 ${id}`,
  routeType: "도보",
  distanceKm: 5,
  durationMs: 3_000_000,
  paceSecPerKm: 600,
  finishedAt: "2026-09-16T07:40:00+09:00",
});
const card = (id: number): SavedRecordCard => ({ id, record: record(id), imageUrl: null, createdAt: "2026-09-16T08:00:00+09:00" });

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.search}</p>;
}

function renderPage(path = "/mypage/records") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mypage/records" element={<><RecordsPage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

const panel = () => screen.getByRole("tabpanel");
const pageButtons = () => within(screen.getByRole("navigation", { name: "페이지네이션" })).getAllByRole("button");

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ status: "signedIn", user: { id: 7, nickname: "길손" } });
  vi.mocked(getRecords).mockReturnValue(Array.from({ length: 23 }, (_, i) => record(i + 1)));
  vi.mocked(getRecordCards).mockReturnValue(Array.from({ length: 14 }, (_, i) => card(i + 1)));
  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RecordsPage", () => {
  it("기록 탭은 10개씩 나눠 보여 준다", () => {
    renderPage();

    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("기록23");
    expect(within(panel()).getAllByRole("listitem")).toHaveLength(10);
    expect(pageButtons().map((b) => b.textContent)).toEqual(["‹", "1", "2", "3", "›"]);

    fireEvent.click(screen.getByRole("button", { name: "3" }));

    expect(within(panel()).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByTestId("location").textContent).toBe("?page=3");
  });

  it("주소의 tab·page로 기록 카드 탭의 해당 쪽을 연다", () => {
    renderPage("/mypage/records?tab=cards&page=2");

    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("기록 카드14");
    // 12개씩이라 2쪽에는 2장이 남는다.
    expect(within(panel()).getAllByRole("img")).toHaveLength(2);
  });

  it("탭을 바꾸면 1쪽으로 돌아간다", () => {
    renderPage("/mypage/records?page=3");

    fireEvent.click(screen.getByRole("tab", { name: /기록 카드/ }));

    expect(screen.getByTestId("location").textContent).toBe("?tab=cards");
    expect(within(panel()).getAllByRole("img")).toHaveLength(12);
  });

  it("범위를 넘은 쪽 번호는 마지막 쪽으로 보여 준다", () => {
    renderPage("/mypage/records?page=99");

    expect(within(panel()).getAllByRole("listitem")).toHaveLength(3);
  });

  it("기록이 없으면 빈 안내를 보여 준다", () => {
    vi.mocked(getRecords).mockReturnValue([]);
    vi.mocked(getRecordCards).mockReturnValue([]);
    renderPage();

    expect(screen.getByText("아직 완주한 기록이 없어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /기록 카드/ }));
    expect(screen.getByText("아직 저장한 기록 카드가 없어요")).toBeTruthy();
  });
});
