// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseDetail } from "./CourseDetail";

const tracking = vi.hoisted(() => ({
  status: "paused" as "idle" | "tracking" | "paused",
  currentLocation: null,
  error: null,
  wakeLockFailed: false,
  startTracking: vi.fn(), pause: vi.fn(), resume: vi.fn(),
  stopTracking: vi.fn(), sampleRecord: vi.fn(() => null),
}));

vi.mock("./useCourseTracking", () => ({ useCourseTracking: () => tracking }));
vi.mock("./KakaoMap", () => ({ KakaoMap: () => null }));
vi.mock("./endpointAddress", () => ({
  useEndpointAddresses: () => [
    { caption: "", main: "코스 시작점" }, { caption: "", main: "코스 종료점" },
  ],
}));
vi.mock("../../components/layout/SidebarDrawer", () => ({ default: () => null }));
vi.mock("../../components/layout/AppHeader", () => ({ default: () => null }));
vi.mock("../nearby/nearbyApi", () => ({
  getNearbySpots: async () => { throw new TypeError("Failed to fetch"); },
}));
vi.mock("./coursesApi", () => ({
  getCourseGpx: async () => [],
  getCourseDetail: async () => ({
    id: 1, title: "테스트 코스", description: "", image_url: "", routes: [],
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({
    matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={["/courses", "/courses/1?tab=nearby"]}>
        <Routes>
          <Route path="/courses" element={<p>코스 목록 화면</p>} />
          <Route path="/courses/:id" element={<CourseDetail />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

describe("CourseDetail 기록이 있는 화면에서 이동", () => {
  it.each(["paused", "tracking"] as const)("%s 중 목록 이동 취소는 세션을 유지하고 승인은 이동한다", async (status) => {
    tracking.status = status;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("기록이 사라집니다"));
    expect(screen.queryByText("코스 목록 화면")).toBeNull();
    expect(tracking.stopTracking).not.toHaveBeenCalled();
    expect(screen.getByText("테스트 코스")).toBeTruthy();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(screen.getByText("코스 목록 화면")).toBeTruthy();
  });

  it("세션이 없으면 확인 없이 목록으로 이동한다", async () => {
    tracking.status = "idle";
    const confirm = vi.spyOn(window, "confirm");
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText("코스 목록 화면")).toBeTruthy();
  });

  it("일시정지 중 화면의 뒤로 버튼도 취소할 수 있다", async () => {
    tracking.status = "paused";
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(screen.queryByText("코스 목록 화면")).toBeNull();
    expect(tracking.stopTracking).not.toHaveBeenCalled();
  });
});
