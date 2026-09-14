// @vitest-environment jsdom
import { useLayoutEffect, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RaceMap from "./RaceMap";

const mock = vi.hoisted(() => ({
  mode: "success" as "success" | "throw" | "silent",
  created: vi.fn(),
  removed: vi.fn(),
}));

vi.mock("react-kakao-maps-sdk", () => ({
  Map: function MockMap({ onCreate, children }: {
    onCreate: (map: kakao.maps.Map) => void;
    children: ReactNode;
  }) {
    // 실제 SDK처럼 지도 생성 단계에서 예외 또는 onCreate 누락을 재현한다.
    useLayoutEffect(() => {
      if (mock.mode === "throw") throw new Error("map creation failed");
      if (mock.mode === "silent") return () => mock.removed();
      const map = { relayout: vi.fn() } as unknown as kakao.maps.Map;
      mock.created(map);
      onCreate(map);
      return () => mock.removed();
    }, [onCreate]);
    return <div data-testid="map">{children}</div>;
  },
  MapMarker: () => <span data-testid="marker" />,
}));

const load = vi.fn((callback: () => void) => callback());
beforeEach(() => {
  vi.useFakeTimers();
  mock.mode = "success";
  mock.created.mockClear();
  mock.removed.mockClear();
  load.mockReset().mockImplementation((callback: () => void) => callback());
  vi.stubGlobal("kakao", { maps: { load } });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const open = () => render(<RaceMap raceTitle="대회" lat={37.5} lng={127} />);
const retry = () => fireEvent.click(screen.getByRole("button", { name: "지도 다시 불러오기" }));
const advance = async (ms: number) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};

it("SDK 성공 후 지도 생성 예외가 나도 재시도하면 정상 표시한다", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  mock.mode = "throw";
  open();
  expect(load).toHaveBeenCalledTimes(1);
  expect(screen.getByText("지도를 불러오지 못했어요.")).toBeTruthy();
  expect(screen.queryByTestId("map")).toBeNull();
  expect(errorLog).toHaveBeenCalled();
  mock.mode = "success";
  retry();
  expect(screen.getByTestId("marker")).toBeTruthy();
  expect(mock.created).toHaveBeenCalledTimes(1);
  await advance(10_000);
  expect(screen.queryByText("지도를 불러오지 못했어요.")).toBeNull();
});

it("onCreate가 없으면 8초 후 실패하고 재시도로 지도를 새로 마운트한다", async () => {
  mock.mode = "silent";
  open();
  await advance(7_999);
  expect(screen.queryByText("지도를 불러오지 못했어요.")).toBeNull();
  await advance(1);
  expect(screen.getByText("지도를 불러오지 못했어요.")).toBeTruthy();
  expect(mock.removed).toHaveBeenCalledTimes(1);
  mock.mode = "success";
  retry();
  expect(mock.created).toHaveBeenCalledTimes(1);
  await advance(10_000);
  expect(screen.getByTestId("map")).toBeTruthy();
  expect(screen.queryByText("지도를 불러오지 못했어요.")).toBeNull();
});

it("정상 생성된 지도는 타임아웃이 지나도 실패로 바뀌지 않는다", async () => {
  open();
  await advance(20_000);
  expect(screen.getByTestId("map")).toBeTruthy();
  expect(mock.created).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "지도 다시 불러오기" })).toBeNull();
});

it("SDK 로딩 타임아웃 후 재시도하고 이전 콜백은 무시한다", async () => {
  let staleCallback: (() => void) | undefined;
  load.mockImplementationOnce((callback) => { staleCallback = callback; });
  open();
  await advance(10_000);
  expect(screen.getByText("지도를 불러오지 못했어요.")).toBeTruthy();
  act(() => staleCallback?.());
  expect(mock.created).not.toHaveBeenCalled();
  retry();
  expect(screen.getByTestId("map")).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(2);
});

it("마운트 대기 중 화면을 떠나면 타이머를 정리한다", async () => {
  mock.mode = "silent";
  const view = open();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  await advance(20_000);
  expect(mock.created).not.toHaveBeenCalled();
});
