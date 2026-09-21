// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode, type ComponentProps } from "react";
import type { RecordCard } from "./components/RecordCard";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseDetail } from "./CourseDetail";
import { announce, primeSpeech } from "./speech";
import { getCourseGpx } from "./coursesApi";
import type { LatLng } from "./types";
import { useAuth } from "../auth";
import { saveMyRecord } from "../mypage/mypageData";
import { completionPlan } from "./courseCompletion";
import { saveRecordCard } from "../mypage/recordsApi";
import { RecordApiError } from "../mypage/recordsErrors";
import { clearAccessToken, writeAccessToken } from "../../lib/authToken";

vi.mock("../auth", async (original) => ({
  ...await original<typeof import("../auth")>(), useAuth: vi.fn(),
}));
vi.mock("../mypage/mypageData", async (original) => ({
  ...await original<typeof import("../mypage/mypageData")>(),
  saveMyRecord: vi.fn(), fetchMyRecords: async () => [], fetchSavedCourses: async () => [],
}));
vi.mock("../mypage/recordsApi", async (original) => ({
  ...await original<typeof import("../mypage/recordsApi")>(), saveRecordCard: vi.fn(),
}));
const cardState = vi.hoisted(() => ({ props: null as ComponentProps<typeof RecordCard> | null }));

const tracking = vi.hoisted(() => ({
  status: "paused" as "idle" | "tracking" | "paused",
  currentLocation: null as LatLng | null,
  error: null,
  wakeLockFailed: false,
  storageFailed: false,
  startTracking: vi.fn(), pause: vi.fn(), resume: vi.fn(),
  stopTracking: vi.fn(), sampleRecord: vi.fn(() => null),
}));

vi.mock("./useCourseTracking", () => ({ useCourseTracking: () => tracking }));
vi.mock("./speech", () => ({ announce: vi.fn(), primeSpeech: vi.fn() }));
vi.mock("./components/RecordCard", () => ({
  RecordCard: (props: ComponentProps<typeof RecordCard>) => {
    cardState.props = props;
    const { record, onClose, onProtectionChange, navigationBlocked, onCancelNavigation, onConfirmNavigation } = props;
    return (
    <div role="dialog" aria-label="restored record">
      <span>{record.distanceKm}</span><button onClick={onClose}>close record</button>
      <button onClick={() => onProtectionChange?.(true)}>카드 편집</button>
      <button onClick={() => onProtectionChange?.(false)}>카드 저장</button>
      {navigationBlocked && <div role="alertdialog" aria-label="이동 확인">
        <button onClick={onCancelNavigation}>계속 편집</button>
        <button onClick={onConfirmNavigation}>저장하지 않고 나가기</button>
      </div>}
    </div>
    );
  },
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
const courseApi = vi.hoisted(() => ({ getCourseDetail: vi.fn() }));
vi.mock("./coursesApi", () => ({
  getCourseGpx: vi.fn(async (): Promise<LatLng[]> => []),
  getCourseDetail: (...args: unknown[]) => courseApi.getCourseDetail(...args),
}));
const COURSE = { id: 1, title: "테스트 코스", description: "", image_url: "", routes: [] };

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({ status: "signedOut", user: null });
  vi.mocked(saveMyRecord).mockReset();
  vi.mocked(saveRecordCard).mockReset().mockResolvedValue({} as Awaited<ReturnType<typeof saveRecordCard>>);
  cardState.props = null;
  courseApi.getCourseDetail.mockImplementation(async () => COURSE);
  tracking.status = "paused";
  tracking.stopTracking.mockReset();
  tracking.currentLocation = null;
  tracking.storageFailed = false;
  vi.mocked(getCourseGpx).mockResolvedValue([]);
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
  clearAccessToken();
});

const SAVED = { id: 42, courseId: 1, courseName: "테스트 코스", routeType: "도보" as const,
  distanceKm: 3, durationMs: 60000, paceSecPerKm: 20, finishedAt: "2026-09-20T01:02:03Z", isCompleted: true };
function login(id = 7) {
  vi.mocked(useAuth).mockReturnValue({ status: "signedIn", user: { id, nickname: "길손" } });
  writeAccessToken(`token-${id}`);
}
async function finishRecord() {
  login();
  tracking.stopTracking.mockReturnValue({ distanceKm: 3, durationMs: 60000.4, paceSecPerKm: 20 });
  await mount();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "■ 종료" })));
}

it.each([50, 99.4, 99.9, 100])("위치 진행률 %s만 복원해서는 완주로 저장하지 않는다", async (progress) => {
  sessionStorage.setItem("course-tracking:1:view", JSON.stringify({ progress }));
  vi.mocked(saveMyRecord).mockResolvedValue(SAVED);
  await finishRecord();
  expect(saveMyRecord).toHaveBeenCalledWith(expect.objectContaining({ isCompleted: false }));
});

it("경로를 순서대로 통과하면 완주 음성과 저장에 같은 판정을 쓴다", async () => {
  login();
  const path = [{ lat: 37.5, lng: 127 }, { lat: 37.502, lng: 127 }];
  const plan = completionPlan(path, "forward");
  vi.mocked(getCourseGpx).mockResolvedValue(path);
  vi.mocked(saveMyRecord).mockResolvedValue(SAVED);
  tracking.stopTracking.mockReturnValue({ distanceKm: 0.22, durationMs: 60000, paceSecPerKm: 272 });
  tracking.status = "tracking";
  const router = await mount();
  for (const [index, point] of plan.points.entries()) {
    tracking.currentLocation = point;
    await act(async () => { await router.navigate(`/courses/1?tab=course&sample=${index}`); });
  }
  expect(announce).toHaveBeenCalledWith("코스를 완주했어요");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "■ 종료" })));
  expect(saveMyRecord).toHaveBeenCalledWith(expect.objectContaining({ isCompleted: true }));
});

it("완주 확인 지점을 복원하면 저장 자격을 유지하고 음성은 반복하지 않는다", async () => {
  const path = [{ lat: 37.5, lng: 127 }, { lat: 37.502, lng: 127 }];
  const plan = completionPlan(path, "forward");
  vi.mocked(getCourseGpx).mockResolvedValue(path);
  sessionStorage.setItem("course-tracking:1:view", JSON.stringify({
    progress: 100, completion: { key: `도보:${plan.key}`, next: plan.points.length },
  }));
  vi.mocked(saveMyRecord).mockResolvedValue(SAVED);
  await finishRecord();
  expect(announce).not.toHaveBeenCalledWith("코스를 완주했어요");
  expect(saveMyRecord).toHaveBeenCalledWith(expect.objectContaining({ isCompleted: true }));
});

it("완주 POST 성공으로 얻은 ID를 카드에 연결하고 복원 데이터에 보존한다", async () => {
  vi.mocked(saveMyRecord).mockResolvedValue(SAVED);
  await finishRecord();
  expect(saveMyRecord).toHaveBeenCalledTimes(1);
  expect(saveMyRecord).toHaveBeenCalledWith(expect.objectContaining({ courseId: 1, routeType: "도보",
    distanceKm: 3, durationMs: 60000.4, paceSecPerKm: 20, finishedAt: expect.any(String) }));
  expect(JSON.parse(sessionStorage.getItem("course-tracking:1:view")!).record).toMatchObject({ serverId: 42, ownerId: 7 });
  const image = new Blob(["png"], { type: "image/png" });
  await cardState.props!.saveToServer!(image, () => true);
  expect(saveRecordCard).toHaveBeenCalledWith(42, image);
});

it.each([
  [503, "아직 제공하지 않는 기능입니다.", "아직 제공하지 않는 기능"],
  [422, [{ loc: ["body", "duration_ms"] }], "허용 범위"],
] as const)("완주 저장 거절 %s를 표시해도 기록 POST를 다시 보내지는 않는다", async (status, detail, message) => {
  const error = new RecordApiError(status, detail);
  vi.mocked(saveMyRecord).mockRejectedValue(error);
  await finishRecord();
  expect(cardState.props!.serverMessage).toContain(message);
  expect(cardState.props!.serverMessage).not.toContain("저장 여부");
  await expect(cardState.props!.saveToServer!(new Blob(), () => true)).rejects.toBe(error);
  expect(saveMyRecord).toHaveBeenCalledTimes(1);
  expect(saveRecordCard).not.toHaveBeenCalled();
});

it("ID가 없을 때 이미지 저장을 요청하면 진행 중인 POST를 기다려 연결한다", async () => {
  let resolve!: (value: typeof SAVED) => void;
  vi.mocked(saveMyRecord).mockReturnValue(new Promise((done) => { resolve = done; }));
  await finishRecord();
  const image = new Blob(["png"], { type: "image/png" });
  const saving = cardState.props!.saveToServer!(image, () => true);
  expect(saveRecordCard).not.toHaveBeenCalled();
  await act(async () => { resolve(SAVED); await saving; });
  expect(saveMyRecord).toHaveBeenCalledTimes(1);
  expect(saveRecordCard).toHaveBeenCalledWith(42, image);
});

it.each(["API 실패", "서버 INSERT 성공 후 응답 유실"])("%s 후 이미지 저장을 반복해도 완주 POST를 재전송하지 않는다", async (scenario) => {
  const serverRows: typeof SAVED[] = [];
  vi.mocked(saveMyRecord).mockImplementation(async () => {
    if (scenario === "서버 INSERT 성공 후 응답 유실") serverRows.push(SAVED);
    throw new TypeError("response lost");
  });
  await finishRecord();
  expect(cardState.props!.serverMessage).toContain("중복 방지");
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(cardState.props!.saveToServer!(new Blob(), () => true)).rejects.toThrow("중복 방지");
  }
  expect(saveMyRecord).toHaveBeenCalledTimes(1);
  expect(serverRows).toHaveLength(scenario === "서버 INSERT 성공 후 응답 유실" ? 1 : 0);
  expect(saveRecordCard).not.toHaveBeenCalled();
});

it.each([42, undefined])("새로고침 후 serverId=%s를 복원하며 새 기록 POST를 보내지 않는다", async (serverId) => {
  login();
  tracking.status = "idle";
  sessionStorage.setItem("course-tracking:1:view", JSON.stringify({ record: {
    summary: { distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }, routeType: "도보", routePoints: [], ownerId: 7, serverId,
  } }));
  await mount();
  const saving = cardState.props!.saveToServer!(new Blob(), () => true);
  if (serverId) { await saving; expect(saveRecordCard).toHaveBeenCalledWith(42, expect.any(Blob)); }
  else { await expect(saving).rejects.toThrow("중복 방지"); expect(saveRecordCard).not.toHaveBeenCalled(); }
  expect(saveMyRecord).not.toHaveBeenCalled();
});

it("다른 사용자로 로그인하면 복원된 이전 사용자 recordId를 재사용하지 않는다", async () => {
  login(8);
  tracking.status = "idle";
  sessionStorage.setItem("course-tracking:1:view", JSON.stringify({ record: {
    summary: { distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }, routeType: "도보", routePoints: [], ownerId: 7, serverId: 42,
  } }));
  await mount();
  await expect(cardState.props!.saveToServer!(new Blob(), () => true)).rejects.toThrow("계정");
  expect(saveMyRecord).not.toHaveBeenCalled();
  expect(saveRecordCard).not.toHaveBeenCalled();
});

it.each(["계정 변경", "카드 닫기"])("기록 응답 대기 중 %s 시 지연된 업로드를 시작하지 않는다", async (reason) => {
  let resolve!: (value: typeof SAVED) => void;
  vi.mocked(saveMyRecord).mockReturnValue(new Promise((done) => { resolve = done; }));
  await finishRecord();
  let active = true;
  const saving = cardState.props!.saveToServer!(new Blob(), () => active);
  const settled = saving.catch(() => undefined);
  if (reason === "계정 변경") writeAccessToken("token-8");
  else active = false;
  await act(async () => { resolve(SAVED); await settled; });
  expect(saveRecordCard).not.toHaveBeenCalled();
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

describe("CourseDetail 저장 실패 경고", () => {
  it.each([false, true])("빈 초기 화면은 저장소가 차단되어도 경고하지 않는다 (추적 실패 상태: %s)", async (storageFailed) => {
    tracking.status = "idle";
    tracking.storageFailed = storageFailed;
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "코스 정보" }));
    expect(remove).toHaveBeenCalledWith("course-tracking:1:view");
    expect(screen.queryByText(/임시 저장하지 못했어요/)).toBeNull();
  });

  it.each(["tracking", "paused"] as const)("%s 상태에서 화면 저장 실패는 경고한다", async (status) => {
    tracking.status = status;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "코스 정보" }));
    expect(screen.getByText(/임시 저장하지 못했어요/).getAttribute("role")).toBe("alert");
  });
});

describe("CourseDetail 페이지 제목", () => {
  it.each([false, true])("로딩 완료 후 제목 요소와 사용자 초점을 유지한다 (초점 이동: %s)", async (moveFocus) => {
    let resolveCourse!: (course: typeof COURSE) => void;
    const pendingCourse = new Promise<typeof COURSE>((resolve) => { resolveCourse = resolve; });
    courseApi.getCourseDetail.mockReturnValue(pendingCourse);
    await mount();

    const heading = screen.getByRole("heading", { level: 1, name: "코스 상세" });
    // 경로 이동 시 부여되는 초점을 재현하고, 실제 데이터 로드 전후의 요소를 비교한다.
    heading.tabIndex = -1;
    heading.focus();
    const toggle = screen.getByRole("button", { name: /코스 정보 (펼치기|접기)/ });
    if (moveFocus) toggle.focus();

    await act(async () => { resolveCourse(COURSE); });

    expect(screen.getByRole("heading", { level: 1, name: "테스트 코스" })).toBe(heading);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.activeElement).toBe(moveFocus ? toggle : heading);
  });

  it("코스를 불러오면 코스명이 탭 제목이자 유일한 h1이다", async () => {
    await mount();

    await screen.findByRole("heading", { level: 1, name: "테스트 코스" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.title).toBe("테스트 코스 | 어디까지왔니");
  });

  it("조회에 실패해도 '코스 상세' 탭 제목과 h1을 둔다", async () => {
    courseApi.getCourseDetail.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    await mount();

    await screen.findByRole("alert");
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["코스 상세"]);
    expect(document.title).toBe("코스 상세 | 어디까지왔니");
  });

  it("불러오는 동안에도 '코스 상세' h1과 로딩 상태 알림이 있다", async () => {
    courseApi.getCourseDetail.mockImplementation(() => new Promise(() => {}));
    await mount();

    expect(screen.getByRole("heading", { level: 1, name: "코스 상세" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("코스를 불러오는 중…");
  });
});

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

it.each(["편집 전", "저장 후", "편집 후"])("%s 카드의 뒤로가기 보호와 데이터 정리", async (state) => {
  tracking.status = "idle";
  sessionStorage.setItem("course-tracking:1:view", JSON.stringify({ record: {
    summary: { distanceKm: 1.23, durationMs: 60000, paceSecPerKm: 50 },
    routeType: "도보", routePoints: [],
  } }));
  const router = await mount();
  const confirm = vi.spyOn(window, "confirm");
  if (state !== "편집 전") fireEvent.click(screen.getByText("카드 편집"));
  if (state === "저장 후") fireEvent.click(screen.getByText("카드 저장"));
  await act(async () => { await router.navigate(-1); });
  if (state === "편집 후") {
    expect(router.state.location.pathname).toBe("/courses/1");
    expect(screen.getByRole("alertdialog", { name: "이동 확인" })).toBeTruthy();
    const saved = sessionStorage.getItem("course-tracking:1:view");
    fireEvent.click(screen.getByText("계속 편집"));
    expect(router.state.location.pathname).toBe("/courses/1");
    expect(sessionStorage.getItem("course-tracking:1:view")).toBe(saved);
    await act(async () => { await router.navigate(-1); });
    await act(async () => { fireEvent.click(screen.getByText("저장하지 않고 나가기")); });
  }
  expect(router.state.location.pathname).toBe("/courses");
  expect(sessionStorage.getItem("course-tracking:1:view")).toBeNull();
  expect(confirm).not.toHaveBeenCalled();
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

it.each([false, true])("시작 거리 경고 중 코스로 이동해도 진행률과 저장값을 유지한다 (복원: %s)", async (restore) => {
  vi.mocked(getCourseGpx).mockResolvedValue([
    { lat: 37.5, lng: 127 }, { lat: 37.52, lng: 127 },
  ]);
  tracking.status = "tracking";
  if (restore) {
    sessionStorage.setItem("course-tracking:1:view", JSON.stringify({
      progress: 0, startChecked: false, tooFarMeters: 5500,
    }));
  }
  const router = await mount();
  for (const lat of [37.45, 37.48, 37.51, 37.52]) {
    tracking.currentLocation = { lat, lng: 127 };
    await act(async () => { await router.navigate(`/courses/1?tab=course&lat=${lat}`); });
    expect(screen.getByRole("alertdialog", { name: "코스에서 너무 멀어요" })).toBeTruthy();
    const saved = JSON.parse(sessionStorage.getItem("course-tracking:1:view")!);
    expect(saved.startChecked).toBe(false);
    expect(saved.progress).toBe(0);
    expect(saved.tooFarMeters).toBeGreaterThan(1000);
  }
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
  sessionStorage.setItem("course-tracking:1", JSON.stringify({ status: "paused", points: [] }));
  await act(async () => { await router.navigate(-1); });
  expect(sessionStorage.getItem("course-tracking:1")).toBeNull();
  expect(sessionStorage.getItem("course-tracking:1:view")).toBeNull();
  await act(async () => { await router.navigate("/courses/1"); });
  expect(screen.queryByRole("dialog", { name: "restored record" })).toBeNull();
});
