// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from "react-router";
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

function LocationProbe() {
  return <div data-testid="location-search">{useLocation().search}</div>;
}

// 뒤로가기를 테스트에서 트리거할 방법이 필요 — declarative MemoryRouter는
// history 객체를 밖으로 안 꺼내주므로, useNavigate()를 쓰는 숨은 버튼을 하나 심는다.
function BackButton() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>뒤로</button>;
}

async function open(url = "/race?eventId=1&keep=yes") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/race" element={<Race />} />
      </Routes>
      <LocationProbe />
      <BackButton />
    </MemoryRouter>,
  );
  await screen.findByRole("button", { name: "대회 A" });
}

function currentSearch() {
  return screen.getByTestId("location-search").textContent;
}

function goBack() {
  fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
}

it("화면을 떠나면 전체 조회 요청을 취소한다", async () => {
  await open();
  const signal = vi.mocked(fetchAllRaces).mock.calls.at(-1)?.[1];
  expect(signal?.aborted).toBe(false);
  cleanup();
  expect(signal?.aborted).toBe(true);
});

it("선택·닫기를 URL에 반영하고 뒤로가기와 재진입 시 선택을 복원한다", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "대회 B" }));
  await waitFor(() => expect(currentSearch()).toBe("?eventId=2&keep=yes"));
  expect(screen.getByTestId("selected").textContent).toBe("2");
  const reloadUrl = "/race" + currentSearch();
  fireEvent.click(screen.getByRole("button", { name: "대회 B" }));
  await waitFor(() => expect(currentSearch()).toBe("?keep=yes"));
  expect(screen.getByTestId("selected").textContent).toBe("none");
  goBack();
  await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("2"));
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
  await waitFor(() => expect(currentSearch()).toBe("?eventId=1&keep=yes"));
  expect(screen.getByTestId("selected").textContent).toBe("1");
});

it("검색으로 선택을 닫을 때 입력한 검색어를 유지한다", async () => {
  await open();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "대회 B" } });
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("대회 B");
  await waitFor(() => expect(currentSearch()).toBe("?keep=yes"));
  expect(screen.queryByRole("button", { name: "대회 A" })).toBeNull();
  goBack();
  await waitFor(() => expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe(""));
  expect(screen.getByTestId("selected").textContent).toBe("1");
});

it("필터로 선택을 닫을 때 적용한 필터를 유지한다", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "자전거" }));
  await waitFor(() => expect(currentSearch()).toBe("?keep=yes"));
  expect(screen.queryByRole("button", { name: "대회 A" })).toBeNull();
  expect(screen.queryByRole("button", { name: "대회 B" })).toBeNull();
});

it("예정 대회 필터와 캘린더 전환도 내부 URL 변경 후 유지한다", async () => {
  await open();
  fireEvent.click(screen.getByRole("checkbox", { name: "예정된 대회만" }));
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  await waitFor(() => expect(currentSearch()).toBe("?keep=yes"));
  goBack();
  await waitFor(() => expect(currentSearch()).toBe("?eventId=1&keep=yes")); // 복원 확인
  fireEvent.click(screen.getByRole("button", { name: "캘린더" }));
  await waitFor(() => expect(currentSearch()).toBe("?keep=yes"));
  expect(screen.queryByRole("searchbox")).toBeNull();
});

it.each(["999", "invalid"])("잘못된 eventId %s 안내를 닫으면 URL에서도 제거한다", async (id) => {
  await open(`/race?eventId=${id}&keep=yes`);
  fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
  expect(screen.queryByText(/선택한 대회를 찾을 수 없어요/)).toBeNull();
  await waitFor(() => expect(currentSearch()).toBe("?keep=yes"));
});
