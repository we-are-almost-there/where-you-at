// @vitest-environment jsdom
//
// 찜한 코스 전체 보기가 코스 탐색 카드를 12개씩 나눠 보여 주고, 카드를 누르면 코스 상세로 가는지 본다.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../auth";
import type { Course } from "../map/types";
import SavedCoursesPage from "./SavedCoursesPage";
import { fetchSavedCourses } from "./mypageData";

vi.mock("../auth", () => ({ useAuth: vi.fn(), useKakaoLogin: () => ({ login: vi.fn(), dialog: null }) }));
vi.mock("./mypageData", () => ({ fetchSavedCourses: vi.fn() }));
vi.mock("../../components/layout/AppHeader", () => ({ default: () => null }));

const course = (id: number, routeType: "도보" | "자전거" = "도보"): Course => ({
  id,
  title: `코스 ${id}`,
  start_address: "강원 춘천시",
  image_url: "",
  region_code: "51110",
  is_population_drop_zone: false,
  landmarks: [],
  routes: [{ route_type: routeType, distance: 5, estimated_time: 60, difficulty: "쉬움" }],
  path_trail: [],
  path_bicycle: [],
});

function renderPage(path = "/mypage/saved") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mypage/saved" element={<SavedCoursesPage />} />
        <Route path="/courses/:id" element={<p>코스 상세</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ status: "signedIn", user: { id: 7, nickname: "길손" } });
  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SavedCoursesPage", () => {
  // 코스 카드 12장을 두 번 그려 다른 테스트와 함께 돌면 기본 제한 시간(5초)을 넘길 때가 있어 넉넉히 둔다.
  it("코스 카드를 12개씩 나눠 보여 준다", { timeout: 15_000 }, async () => {
    vi.mocked(fetchSavedCourses).mockResolvedValue(Array.from({ length: 14 }, (_, i) => course(i + 1)));
    renderPage();

    expect(await screen.findByText("모두 14개")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(12);

    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("카드를 누르면 코스 상세로 간다", async () => {
    vi.mocked(fetchSavedCourses).mockResolvedValue([course(3, "자전거")]);
    renderPage();

    // 카드에는 찜(하트) 버튼도 있어 코스 이름만으로는 둘이 잡힌다. 카드 버튼은 이름에 주소가 이어진다.
    fireEvent.click(await screen.findByRole("button", { name: /코스 3 강원 춘천시/ }));

    expect(screen.getByText("코스 상세")).toBeTruthy();
  });

  it("찜한 코스가 없으면 코스 둘러보기로 이어 준다", async () => {
    vi.mocked(fetchSavedCourses).mockResolvedValue([]);
    renderPage();

    expect((await screen.findByRole("link", { name: "코스 둘러보기" })).getAttribute("href")).toBe("/courses");
  });

  it("불러오지 못하면 다시 시도할 수 있다", async () => {
    vi.mocked(fetchSavedCourses).mockRejectedValueOnce(new Error("500")).mockResolvedValueOnce([course(1)]);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("모두 1개")).toBeTruthy();
  });

  it("로그인하지 않았으면 로그인 안내를 보여 준다", () => {
    vi.mocked(useAuth).mockReturnValue({ status: "signedOut", user: null });
    renderPage();

    expect(screen.getByRole("button", { name: "카카오로 로그인" })).toBeTruthy();
    expect(fetchSavedCourses).not.toHaveBeenCalled();
  });
});
