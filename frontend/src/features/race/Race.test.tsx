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
vi.mock("./components/RaceCalendar", () => ({ default: ({ races, selectedRaceId, onSelectRace }: {
  races: RaceType[]; selectedRaceId: number | null;
  // 두 번째 인자: "+N개"로 펼친 목록에서 고른 경우의 초점 복귀 대상
  onSelectRace: (race: RaceType, returnTarget?: HTMLElement | null) => void;
}) => <div><output data-testid="selected">{selectedRaceId ?? "none"}</output>{races.map((race) =>
  <button key={race.event_id} onClick={() => onSelectRace(race)}>{race.race_title}</button>
)}<button id="calendar-more">+N개</button>
<button onClick={() => onSelectRace(races[0], document.getElementById("calendar-more"))}>펼친 목록의 첫 대회</button>
</div> }));
vi.mock("./components/RaceDetailSheet", () => ({ default: ({ onClose, getReturnTarget }: {
  onClose: () => void; getReturnTarget?: () => HTMLElement | null | undefined;
}) => <><button onClick={onClose}>상세 닫기</button>
  <output data-testid="return-target">{getReturnTarget?.()?.id || getReturnTarget?.()?.textContent}</output></>
}));

const scroll = vi.fn();
let mediaMatches = true;
let mediaListener: (() => void) | null = null;

beforeEach(() => {
  scroll.mockClear();
  mediaMatches = true;
  mediaListener = null;
  vi.stubGlobal("matchMedia", () => ({
    get matches() { return mediaMatches; },
    addEventListener: (_: string, listener: () => void) => { mediaListener = listener; },
    removeEventListener: () => { mediaListener = null; },
  }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scroll });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function resizeToDesktop() {
  mediaMatches = true;
  act(() => { mediaListener?.(); });
}

function resizeToMobile() {
  mediaMatches = false;
  act(() => { mediaListener?.(); });
}

function LocationProbe() {
  return <div data-testid="location-search">{useLocation().search}</div>;
}

// 뒤로가기를 테스트에서 트리거할 방법이 필요 — declarative MemoryRouter는
// history 객체를 밖으로 안 꺼내주므로, useNavigate()를 쓰는 숨은 버튼을 하나 심는다.
function BackButton() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>뒤로</button>;
}

// 데스크톱에서는 선택/닫기가 replace로 처리되므로, "뒤로가기가 실제로 페이지를
// 벗어나는지"를 검증하려면 진입 전 엔트리가 하나 더 필요하다.
async function open(url = "/race?eventId=1&keep=yes") {
  render(
    <MemoryRouter initialEntries={["/", url]} initialIndex={1}>
      <Routes>
        <Route path="/" element={<div>홈</div>} />
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

function expectSearchParams(expected: Record<string, string>) {
  const params = new URLSearchParams(currentSearch() ?? "");
  for (const [key, value] of Object.entries(expected)) {
    expect(params.get(key)).toBe(value);
  }
}

it("필터와 보기 전환의 선택 상태를 aria-pressed로 알린다", async () => {
  await open("/race");

  expect(screen.getByRole("button", { name: "전체", pressed: true })).toBeTruthy();
  expect(screen.getByRole("button", { name: "목록", pressed: true })).toBeTruthy();
  expect(screen.getByRole("button", { name: "캘린더", pressed: false })).toBeTruthy();

  for (const name of ["러닝", "자전거"]) {
    fireEvent.click(screen.getByRole("button", { name, pressed: false }));
    expect(screen.getByRole("button", { name, pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "전체", pressed: false })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name, pressed: true }));
    expect(screen.getByRole("button", { name: "전체", pressed: true })).toBeTruthy();
  }

  fireEvent.click(screen.getByRole("button", { name: "러닝" }));
  fireEvent.click(screen.getByRole("button", { name: "전체" }));
  expect(screen.getByRole("button", { name: "러닝", pressed: false })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "캘린더" }));
  expect(screen.getByRole("button", { name: "캘린더", pressed: true })).toBeTruthy();
  expect(screen.getByRole("button", { name: "목록", pressed: false })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "목록" }));
  expect(screen.getByRole("button", { name: "목록", pressed: true })).toBeTruthy();
  expect(screen.getByRole("button", { name: "캘린더", pressed: false })).toBeTruthy();
});

it("화면을 떠나면 전체 조회 요청을 취소한다", async () => {
  await open();
  const signal = vi.mocked(fetchAllRaces).mock.calls.at(-1)?.[1];
  expect(signal?.aborted).toBe(false);
  cleanup();
  expect(signal?.aborted).toBe(true);
});

it("데스크톱에서는 선택·닫기가 history entry를 쌓지 않고, 뒤로가기 한 번이면 페이지를 벗어난다", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "대회 B" }));
  await waitFor(() => expectSearchParams({ eventId: "2", keep: "yes" }));
  expect(screen.getByTestId("selected").textContent).toBe("2");

  const reloadUrl = "/race" + currentSearch();

  // 여러 번 선택을 바꿔도 entry가 쌓이지 않아야 한다.
  fireEvent.click(screen.getByRole("button", { name: "대회 B" })); // 닫기
  await waitFor(() => expectSearchParams({ keep: "yes" }));
  fireEvent.click(screen.getByRole("button", { name: "대회 A" })); // 다시 선택
  await waitFor(() => expectSearchParams({ eventId: "1", keep: "yes" }));

  goBack();
  await waitFor(() => screen.getByText("홈"));

  cleanup();
  await open(reloadUrl);
  expect(screen.getByTestId("selected").textContent).toBe("2");
});

it("모바일에서는 선택·닫기마다 history entry가 쌓이고 뒤로가기로 단계별 복원한다", async () => {
  mediaMatches = false;
  await open();
  fireEvent.click(screen.getByRole("button", { name: "대회 B" }));
  await waitFor(() => expectSearchParams({ eventId: "2", keep: "yes" }));
  expect(screen.getByTestId("selected").textContent).toBe("2");

  fireEvent.click(screen.getByRole("button", { name: "상세 닫기" }));
  await waitFor(() => expectSearchParams({ keep: "yes" }));
  expect(screen.getByTestId("selected").textContent).toBe("none");

  goBack();
  await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("2"));
});

it("최초 딥링크만 스크롤하고 닫았다 다시 선택해도 재실행하지 않는다", async () => {
  await open();
  await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "대회 A" }));
  fireEvent.click(screen.getByRole("button", { name: "대회 A" }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  expect(scroll).toHaveBeenCalledTimes(1);
  await waitFor(() => expectSearchParams({ eventId: "1", keep: "yes" }));
  expect(screen.getByTestId("selected").textContent).toBe("1");
});

it("검색으로 선택을 닫을 때 입력한 검색어를 유지한다", async () => {
  await open();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "대회 B" } });
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("대회 B");
  await waitFor(() => expectSearchParams({ keep: "yes" }));
  expect(screen.queryByRole("button", { name: "대회 A" })).toBeNull();
  expect(screen.getByTestId("selected").textContent).toBe("none");
});

it("필터로 선택을 닫을 때 적용한 필터를 유지한다", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "자전거" }));
  await waitFor(() => expectSearchParams({ keep: "yes" }));
  expect(screen.queryByRole("button", { name: "대회 A" })).toBeNull();
  expect(screen.queryByRole("button", { name: "대회 B" })).toBeNull();
});

it("예정 대회 필터와 캘린더 전환도 내부 URL 변경 후 유지한다", async () => {
  await open();
  fireEvent.click(screen.getByRole("checkbox", { name: "예정된 대회만" }));
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  await waitFor(() => expectSearchParams({ keep: "yes" }));
  fireEvent.click(screen.getByRole("button", { name: "캘린더" }));
  await waitFor(() => expectSearchParams({ keep: "yes" }));
  expect(screen.queryByRole("searchbox")).toBeNull();
});

it.each(["999", "invalid"])("잘못된 eventId %s 안내를 닫으면 URL에서도 제거한다", async (id) => {
  await open(`/race?eventId=${id}&keep=yes`);
  fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
  expect(screen.queryByText(/선택한 대회를 찾을 수 없어요/)).toBeNull();
  await waitFor(() => expectSearchParams({ keep: "yes" }));
});

it("모바일 캘린더의 펼친 목록에서 연 상세는 닫힌 뒤 '+N개' 버튼으로 초점을 돌려준다", async () => {
  await open("/race?keep=yes");
  resizeToMobile();
  fireEvent.click(screen.getByRole("button", { name: "캘린더" }));

  // 펼친 목록의 버튼은 선택과 동시에 사라지므로, 누른 버튼이 아니라 넘겨받은 대상을 쓴다.
  const picked = screen.getByRole("button", { name: "펼친 목록의 첫 대회" });
  picked.focus();
  fireEvent.click(picked);

  await waitFor(() => expect(screen.getByTestId("return-target").textContent).toBe("calendar-more"));
});

it("모바일 캘린더에서 칸의 대회를 바로 누르면 그 버튼으로 초점을 돌려준다", async () => {
  await open("/race?keep=yes");
  resizeToMobile();
  fireEvent.click(screen.getByRole("button", { name: "캘린더" }));

  const button = screen.getByRole("button", { name: "대회 B" });
  button.focus();
  fireEvent.click(button);

  await waitFor(() => expect(screen.getByTestId("return-target").textContent).toBe("대회 B"));
});

it("모바일 캘린더에서 필터에 안 걸리는 대회를 선택한 뒤 데스크톱으로 전환해도 상세가 보인다", async () => {
  await open("/race?keep=yes");
  resizeToMobile();

  fireEvent.click(screen.getByRole("checkbox", { name: "예정된 대회만" }));
  fireEvent.click(screen.getByRole("button", { name: "캘린더" }));
  fireEvent.click(screen.getByRole("button", { name: "대회 A" }));
  await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("1"));

  resizeToDesktop();

  await waitFor(() => {
    expect(screen.getByTestId("selected").textContent).toBe("1");
  });
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
});

it("데스크톱에서는 뒤로가기가 여러 번 조작을 거쳐도 페이지를 한 번에 벗어난다", async () => {
  await open("/race?keep=yes");
  fireEvent.click(screen.getByRole("button", { name: "대회 A" }));
  fireEvent.click(screen.getByRole("button", { name: "자전거" }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "검색어" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "예정된 대회만" }));

  goBack();
  await waitFor(() => screen.getByText("홈"));
});

it("모바일에서 상세를 뒤로가기로 닫아도 뷰·필터는 유지된다", async () => {
  mediaMatches = false;
  await open("/race?keep=yes");

  fireEvent.click(screen.getByRole("checkbox", { name: "예정된 대회만" }));
  fireEvent.click(screen.getByRole("button", { name: "캘린더" }));
  fireEvent.click(screen.getByRole("button", { name: "대회 A" }));
  await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("1"));

  // selectRace()를 거치지 않는 브라우저/제스처 뒤로가기
  goBack();

  await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("none"));
  // 뷰 모드와 필터가 유지되어야 한다 — 캘린더 모드에서는 검색창이 없으므로
  // 캘린더가 그대로 유지됐는지는 검색창 부재로, 필터는 체크박스로 확인한다.
  expect(screen.queryByRole("searchbox")).toBeNull();
  // 체크박스는 목록 뷰에서만 렌더되므로, 목록으로 전환(selectRace(null)만
  // 거치는 내부 액션이라 upcomingOnly는 건드리지 않음)한 뒤 필터 유지를 확인한다.
  fireEvent.click(screen.getByRole("button", { name: "목록" }));
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
});
