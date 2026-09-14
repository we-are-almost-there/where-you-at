// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import Race from "./Race";
import { fetchAllRaces } from "./raceApi";
import type { Race as RaceType } from "./types";

vi.mock("../../components/layout/AppHeader", () => ({ default: () => null }));
vi.mock("../../components/layout/Footer", () => ({ default: () => null }));
vi.mock("./raceApi", () => ({ fetchAllRaces: vi.fn(async () => [
  { event_id: 1, race_title: "대회 A", event_type: "running", start_date: "2026-10-01" },
  { event_id: 2, race_title: "대회 B", event_type: "running", start_date: "2026-10-02" },
]) }));
vi.mock("./components/RaceList", () => ({ default: ({ races, selectedRaceId, onSelectRace }: {
  races: RaceType[]; selectedRaceId: number | null; onSelectRace: (race: RaceType) => void;
}) => <div><output data-testid="selected">{selectedRaceId ?? "none"}</output>{races.map((race) =>
  <button key={race.event_id} id={`race-trigger-${race.event_id}`} onClick={() => onSelectRace(race)}>{race.race_title}</button>
)}</div> }));
vi.mock("./components/RaceCalendar", () => ({ default: () => null }));
vi.mock("./components/RaceDetailSheet", () => ({ default: () => null }));

const scroll = vi.fn();
beforeEach(() => {
  scroll.mockClear();
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scroll });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function open(url = "/race?eventId=1&keep=yes") {
  const router = createMemoryRouter([{ path: "/race", element: <Race /> }], { initialEntries: [url] });
  render(<RouterProvider router={router} />);
  await screen.findByRole("button", { name: "대회 A" });
  return router;
}

it("화면을 떠나면 전체 조회 요청을 취소한다", async () => {
  await open();
  const signal = vi.mocked(fetchAllRaces).mock.calls.at(-1)?.[1];
  expect(signal?.aborted).toBe(false);
  cleanup();
  expect(signal?.aborted).toBe(true);
});

it("선택·닫기를 URL에 반영하고 뒤로가기와 재진입 시 선택을 복원한다", async () => {
  const router = await open();
  fireEvent.click(screen.getByRole("button", { name: "대회 B" }));
  expect(router.state.location.search).toBe("?eventId=2&keep=yes");
  expect(screen.getByTestId("selected").textContent).toBe("2");
  const reloadUrl = router.state.location.pathname + router.state.location.search;
  fireEvent.click(screen.getByRole("button", { name: "대회 B" }));
  expect(router.state.location.search).toBe("?keep=yes");
  expect(screen.getByTestId("selected").textContent).toBe("none");
  await act(async () => { await router.navigate(-1); });
  expect(screen.getByTestId("selected").textContent).toBe("2");
  cleanup();
  await open(reloadUrl);
  expect(screen.getByTestId("selected").textContent).toBe("2");
});

it("최초 딥링크만 스크롤하고 닫았다 다시 선택해도 재실행하지 않는다", async () => {
  await open();
  await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "대회 A" }));
  fireEvent.click(screen.getByRole("button", { name: "대회 A" }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  expect(scroll).toHaveBeenCalledTimes(1);
});

it("검색으로 선택을 닫을 때 입력한 검색어를 유지한다", async () => {
  const router = await open();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "대회 B" } });
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("대회 B");
  expect(router.state.location.search).toBe("?keep=yes");
  expect(screen.queryByRole("button", { name: "대회 A" })).toBeNull();
  await act(async () => { await router.navigate(-1); });
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  expect(screen.getByTestId("selected").textContent).toBe("1");
});

it("필터로 선택을 닫을 때 적용한 필터를 유지한다", async () => {
  const router = await open();
  fireEvent.click(screen.getByRole("button", { name: "자전거" }));
  expect(router.state.location.search).toBe("?keep=yes");
  expect(screen.queryByRole("button", { name: "대회 A" })).toBeNull();
  expect(screen.queryByRole("button", { name: "대회 B" })).toBeNull();
});

it("예정 대회 필터와 캘린더 전환도 내부 URL 변경 후 유지한다", async () => {
  const router = await open();
  fireEvent.click(screen.getByRole("checkbox", { name: "예정된 대회만" }));
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  expect(router.state.location.search).toBe("?keep=yes");
  await act(async () => { await router.navigate(-1); });
  fireEvent.click(screen.getByRole("button", { name: "캘린더" }));
  expect(router.state.location.search).toBe("?keep=yes");
  expect(screen.queryByRole("searchbox")).toBeNull();
});

it.each(["999", "invalid"])("잘못된 eventId %s 안내를 닫으면 URL에서도 제거한다", async (id) => {
  const router = await open(`/race?eventId=${id}&keep=yes`);
  fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
  expect(screen.queryByText(/선택한 대회를 찾을 수 없어요/)).toBeNull();
  expect(router.state.location.search).toBe("?keep=yes");
});
