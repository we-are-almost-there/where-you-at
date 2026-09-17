// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseDetail } from "./CourseDetail";
import { announce, primeSpeech } from "./speech";

const tracking = vi.hoisted(() => ({
  status: "paused" as "idle" | "tracking" | "paused",
  currentLocation: null,
  error: null,
  wakeLockFailed: false,
  startTracking: vi.fn(), pause: vi.fn(), resume: vi.fn(),
  stopTracking: vi.fn(), sampleRecord: vi.fn(() => null),
}));

vi.mock("./useCourseTracking", () => ({ useCourseTracking: () => tracking }));
vi.mock("./speech", () => ({ announce: vi.fn(), primeSpeech: vi.fn() }));
vi.mock("./components/RecordCard", () => ({
  RecordCard: ({ record, onClose }: { record: { distanceKm: number }; onClose: () => void }) => (
    <div role="dialog" aria-label="restored record">
      <span>{record.distanceKm}</span><button onClick={onClose}>close record</button>
    </div>
  ),
}));
vi.mock("./KakaoMap", () => ({ KakaoMap: () => null }));
vi.mock("./endpointAddress", () => ({
  useEndpointAddresses: () => [
    { caption: "", main: "코스 시작점" }, { caption: "", main: "코스 종료점" },
  ],
}));
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
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({
    matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  // jsdom 환경에서는 AbortSignal은 jsdom 구현이고 Request는 Node(undici) 구현이라, 데이터 라우터가
  // 이동마다 new Request(url, { signal })을 만들면 타입 오류로 이동이 멈춘다. 이 라우트들에는
  // loader가 없어 취소 신호가 필요 없으므로 signal을 빼고 만든다.
  const NodeRequest = globalThis.Request;
  vi.stubGlobal("Request", class extends NodeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const rest = { ...init };
      delete rest.signal;
      super(input, rest);
    }
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  const router = createMemoryRouter([
    { path: "/", element: <p>홈 화면</p> },
    { path: "/races", element: <p>대회 화면</p> },
    { path: "/courses", element: <p>코스 목록 화면</p> },
    { path: "/courses/:id", element: <CourseDetail /> },
  ], { initialEntries: ["/courses", "/courses/1?tab=nearby"] });
  await act(async () => {
    render(<StrictMode><RouterProvider router={router} /></StrictMode>);
  });
  return router;
}

describe("CourseDetail 기록이 있는 화면에서 이동", () => {
  it.each(["tracking", "paused"] as const)("%s 중 브라우저 이탈은 경고하며 세션은 유지한다", async (status) => {
    tracking.status = status;
    const confirm = vi.spyOn(window, "confirm");
    await mount();
    const event = new Event("beforeunload", { cancelable: true });
    expect(window.dispatchEvent(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(tracking.stopTracking).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("세션 시작과 종료에 따라 보호를 전환하고 화면 제거 시 해제한다", async () => {
    tracking.status = "idle";
    const router = await mount();
    const unloadIsAllowed = () => window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
    // tracking은 목 객체라 상태만 바꿔서는 다시 그려지지 않는다. 같은 화면 안의 이동으로 다시 그리게 한다.
    const rerender = async () => {
      await act(async () => { await router.navigate(router.state.location.pathname + "?tab=course"); });
    };
    expect(unloadIsAllowed()).toBe(true);
    tracking.status = "tracking";
    await rerender();
    expect(unloadIsAllowed()).toBe(false);
    tracking.status = "paused";
    await rerender();
    expect(unloadIsAllowed()).toBe(false);
    tracking.status = "idle";
    await rerender();
    expect(unloadIsAllowed()).toBe(true);
    tracking.status = "tracking";
    await rerender();
    expect(unloadIsAllowed()).toBe(false);
    cleanup();
    expect(unloadIsAllowed()).toBe(true);
  });

  it.each([
    ["paused", "logo", "/"], ["tracking", "logo", "/"],
    ["paused", "header", "/races"], ["tracking", "header", "/races"],
    ["paused", "sidebar", "/races"], ["tracking", "sidebar", "/races"],
  ] as const)("%s 중 %s 이동은 취소하면 유지하고 확인하면 목적지로 이동한다", async (status, source, destination) => {
    tracking.status = status;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const router = await mount();
    if (source === "sidebar") fireEvent.click(screen.getByRole("button", { name: "메뉴" }));
    const container = source === "sidebar" ? screen.getByRole("dialog", { name: "메뉴" }) : screen.getByRole("banner");
    const link = () => within(container).getAllByRole("link").find((item) => item.getAttribute("href") === destination)!;
    fireEvent.click(link());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe("/courses/1");
    expect(screen.getByText("테스트 코스")).toBeTruthy();
    expect(tracking.stopTracking).not.toHaveBeenCalled();
    if (source === "sidebar") fireEvent.click(screen.getByRole("button", { name: "메뉴" }));
    confirm.mockReturnValue(true);
    fireEvent.click(link());
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(router.state.location.pathname).toBe(destination);
    expect(screen.queryByText("테스트 코스")).toBeNull();
  });

  it.each([-1, "/courses/2"] as const)("기록이 있으면 %s 이동도 확인한다", async (destination) => {
    tracking.status = "paused";
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const router = await mount();
    const move = () => typeof destination === "number" ? router.navigate(destination) : router.navigate(destination);
    await act(async () => { await move(); });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe("/courses/1");
    confirm.mockReturnValue(true);
    await act(async () => { await move(); });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(router.state.location.pathname).toBe(destination === -1 ? "/courses" : destination);
  });

  it("일시정지 중 같은 코스의 탭 변경은 확인하지 않는다", async () => {
    tracking.status = "paused";
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const router = await mount();
    fireEvent.click(screen.getByRole("tab", { name: "코스 정보" }));
    expect(screen.getByRole("tab", { name: "코스 정보" }).getAttribute("aria-selected")).toBe("true");
    expect(router.state.location.pathname).toBe("/courses/1");
    expect(confirm).not.toHaveBeenCalled();
    expect(tracking.stopTracking).not.toHaveBeenCalled();
  });

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
    expect(tracking.stopTracking).toHaveBeenCalledTimes(1);
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


it("저장하지 않은 기록 카드를 복원하고 닫으면 저장값을 지운다", async () => {
  tracking.status = "idle";
  sessionStorage.setItem("course-tracking:1:view", JSON.stringify({
    direction: "reverse", progress: 85, startChecked: true,
    record: {
      summary: { distanceKm: 1.23, durationMs: 60_000, paceSecPerKm: 50 },
      routeType: "\uB3C4\uBCF4", routePoints: [],
    },
  }));
  await mount();
  expect(screen.getByRole("dialog", { name: "restored record" })).toBeTruthy();
  expect(screen.getByText("1.23")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "close record" }));
  expect(sessionStorage.getItem("course-tracking:1:view")).toBeNull();
});

it.each([
  { summary: null, routeType: "도보", routePoints: [] },
  { summary: { distanceKm: -1, durationMs: 100, paceSecPerKm: null }, routeType: "도보", routePoints: [] },
  { summary: { distanceKm: 1, durationMs: "100", paceSecPerKm: null }, routeType: "도보", routePoints: [] },
  { summary: { distanceKm: 1, durationMs: 100, paceSecPerKm: "50" }, routeType: "도보", routePoints: [] },
  { summary: { distanceKm: 1, durationMs: 100, paceSecPerKm: null }, routeType: "기타", routePoints: [] },
  { summary: { distanceKm: 1, durationMs: 100, paceSecPerKm: null }, routeType: "도보", routePoints: [null] },
  { summary: { distanceKm: 1, durationMs: 100, paceSecPerKm: null }, routeType: "도보", routePoints: [{ lat: "37", lng: 127 }] },
])("손상된 기록 카드는 복원하지 않는다: %j", async (record) => {
  tracking.status = "idle";
  sessionStorage.setItem("course-tracking:1:view", JSON.stringify({ record }));
  await mount();
  expect(screen.queryByRole("dialog", { name: "restored record" })).toBeNull();
  expect(sessionStorage.getItem("course-tracking:1:view")).toBeNull();
});


it.each(["tracking", "paused"] as const)("복원된 %s 상태에서 첫 사용자 입력으로 음성 재생을 한 번 준비한다", async (status) => {
  tracking.status = status;
  await mount();
  expect(primeSpeech).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(primeSpeech).not.toHaveBeenCalled();
  fireEvent.click(document.body);
  expect(primeSpeech).toHaveBeenCalledTimes(1);
  fireEvent.click(document.body);
  fireEvent.keyDown(document, { key: "Enter" });
  expect(primeSpeech).toHaveBeenCalledTimes(1);
});

it("복원 후 키보드 실행 입력으로 음성 재생을 준비하고 화면 이동 시 입력 리스너를 해제한다", async () => {
  tracking.status = "tracking";
  const router = await mount();
  fireEvent.keyDown(document, { key: "Enter" });
  expect(primeSpeech).toHaveBeenCalledTimes(1);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await act(async () => { await router.navigate("/courses"); });
  fireEvent.click(document.body);
  expect(primeSpeech).toHaveBeenCalledTimes(1);
});

it.each([-1, 101, null, "100"])("잘못된 진행률 %s는 복원하지 않는다", async (progress) => {
  tracking.status = "paused";
  sessionStorage.setItem("course-tracking:1:view", JSON.stringify({ progress }));
  await mount();
  expect(JSON.parse(sessionStorage.getItem("course-tracking:1:view")!).progress).toBe(0);
  expect(announce).not.toHaveBeenCalled();
});

it("시작 거리 경고를 복원해 경고가 열린 상태에서 진행률이 계산되지 않도록 한다", async () => {
  tracking.status = "tracking";
  sessionStorage.setItem("course-tracking:1:view", JSON.stringify({
    progress: 0, startChecked: false, tooFarMeters: 2000,
  }));
  await mount();
  expect(screen.getByRole("alertdialog", { name: "코스에서 너무 멀어요" })).toBeTruthy();
  const saved = JSON.parse(sessionStorage.getItem("course-tracking:1:view")!);
  expect(saved.tooFarMeters).toBe(2000);
  expect(saved.startChecked).toBe(false);
  expect(saved.progress).toBe(0);
});

it.each([100, 99.9])("진행률 %s를 복원하면 완주 음성을 반복하지 않는다", async (progress) => {
  tracking.status = "paused";
  sessionStorage.setItem("course-tracking:1:view", JSON.stringify({ progress }));
  const router = await mount();
  expect(announce).not.toHaveBeenCalled();
  tracking.status = "tracking";
  await act(async () => { await router.navigate("/courses/1?tab=course"); });
  expect(announce).not.toHaveBeenCalled();
});

it("기록 카드를 열고 다른 화면으로 이동하면 같은 코스에 다시 들어와도 카드가 열리지 않는다", async () => {
  tracking.status = "idle";
  sessionStorage.setItem("course-tracking:1:view", JSON.stringify({
    record: {
      summary: { distanceKm: 1, durationMs: 60_000, paceSecPerKm: 60 },
      routeType: "도보", routePoints: [],
    },
  }));
  const router = await mount();
  expect(screen.getByRole("dialog", { name: "restored record" })).toBeTruthy();
  await act(async () => { await router.navigate(-1); });
  expect(sessionStorage.getItem("course-tracking:1:view")).toBeNull();
  await act(async () => { await router.navigate("/courses/1"); });
  expect(screen.queryByRole("dialog", { name: "restored record" })).toBeNull();
});
