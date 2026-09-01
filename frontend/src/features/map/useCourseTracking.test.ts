// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackingRecord } from "./trackingRecord";
import {
  getGeolocationErrorMessage,
  isTerminalGeolocationError,
  useCourseTracking,
} from "./useCourseTracking";

describe("getGeolocationErrorMessage", () => {
  it.each([
    [1, "현재 위치를 사용하려면 위치 권한을 허용해 주세요."],
    [2, "현재 위치를 확인할 수 없어요. 잠시 후 다시 시도해 주세요."],
    [3, "현재 위치 확인에 시간이 오래 걸리고 있어요. 다시 시도해 주세요."],
    [0, "현재 위치를 불러오지 못했어요. 다시 시도해 주세요."],
  ])("오류 코드 %i를 사용자 안내 문구로 변환한다", (code, expected) => {
    expect(getGeolocationErrorMessage(code)).toBe(expected);
  });
});

describe("isTerminalGeolocationError", () => {
  it("권한 거부만 위치 감시를 종료한다", () => {
    expect(isTerminalGeolocationError(1)).toBe(true);
    expect(isTerminalGeolocationError(2)).toBe(false);
    expect(isTerminalGeolocationError(3)).toBe(false);
  });
});

// 감시 중인 콜백을 붙잡아 두고 테스트가 원할 때 표본·오류를 흘려보낸다.
// 실제 브라우저처럼 watchPosition 호출이 끝난 뒤에 콜백이 오게 해야 한다 —
// 등록 도중에 오류를 부르면 resume()이 뒤이어 setStatus("tracking")으로 덮어써
// 실제로는 나올 수 없는 상태가 만들어진다.
let watchers: { success: PositionCallback; error: PositionErrorCallback }[] = [];
let now = 0;

function latestWatcher() {
  const watcher = watchers.at(-1);
  if (!watcher) throw new Error("위치 감시가 걸려 있지 않다");
  return watcher;
}

/** 위도 0.001도 ≈ 111m. index만큼 북쪽으로 옮긴 표본을 elapsedSec 뒤에 흘려보낸다. */
function emit(index: number, elapsedSec: number) {
  now += elapsedSec * 1000;
  const position = {
    coords: { latitude: 37.5 + index * 0.001, longitude: 127.0, accuracy: 10, heading: null },
    timestamp: now,
  } as unknown as GeolocationPosition;
  act(() => latestWatcher().success(position));
}

/** 권한 거부(code 1). 브라우저는 이 뒤로 표본을 주지 않는다. */
function deny() {
  act(() => latestWatcher().error({ code: 1, message: "" } as GeolocationPositionError));
}

/** act 밖으로 기록을 꺼낸다(콜백 안 대입이라 타입이 좁혀지지 않게 단언한다). */
function stopAndTakeRecord(stop: () => TrackingRecord | null) {
  let record: TrackingRecord | null = null;
  act(() => {
    record = stop();
  });
  return record as TrackingRecord | null;
}

beforeEach(() => {
  watchers = [];
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      // push가 돌려주는 길이를 감시 id로 쓴다(1부터 시작해 null과 섞이지 않는다).
      watchPosition: (success: PositionCallback, error: PositionErrorCallback) =>
        watchers.push({ success, error }),
      clearWatch: vi.fn(),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCourseTracking 권한 거부", () => {
  it("시작하자마자 거부되면 남길 기록이 없어 초기 상태로 돌아간다", () => {
    const { result } = renderHook(() => useCourseTracking());

    act(() => result.current.startTracking());
    expect(result.current.status).toBe("tracking");

    deny();

    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("현재 위치를 사용하려면 위치 권한을 허용해 주세요.");
    expect(stopAndTakeRecord(result.current.stopTracking)).toBeNull();
  });

  it("재개하다 거부돼도 앞서 모은 기록은 지키고 일시정지로 남는다", () => {
    const { result } = renderHook(() => useCourseTracking());

    act(() => result.current.startTracking());
    emit(0, 0);
    emit(1, 60); // 약 111m 이동

    act(() => result.current.pause());
    act(() => result.current.resume());
    deny();

    // idle로 떨어지면 종료 버튼이 사라져 기록을 남길 방법 자체가 없어진다.
    expect(result.current.status).toBe("paused");
    expect(result.current.error).toBe("현재 위치를 사용하려면 위치 권한을 허용해 주세요.");
    expect(stopAndTakeRecord(result.current.stopTracking)?.distanceKm).toBeGreaterThan(0.1);
  });

  it("주행 중 권한이 회수돼도 마찬가지로 기록을 지킨다", () => {
    const { result } = renderHook(() => useCourseTracking());

    act(() => result.current.startTracking());
    emit(0, 0);
    emit(1, 60);

    deny();

    expect(result.current.status).toBe("paused");
    expect(result.current.currentLocation).not.toBeNull(); // 마지막 위치 마커는 남긴다
    expect(stopAndTakeRecord(result.current.stopTracking)?.distanceKm).toBeGreaterThan(0.1);
  });

  it("거부로 멈춘 뒤 흐른 시간은 활동 시간에 더하지 않는다", () => {
    const { result } = renderHook(() => useCourseTracking());

    act(() => result.current.startTracking());
    emit(0, 0);
    emit(1, 60);

    deny();
    now += 600_000; // 권한을 고치느라 10분을 보냈다

    // 구간을 닫지 않고 일시정지로 넘기면 이 10분이 통째로 활동 시간에 섞인다.
    expect(stopAndTakeRecord(result.current.stopTracking)?.durationMs).toBe(60_000);
  });

  it("거부된 재개를 다시 시도해도 정지 구간은 여전히 끊긴다", () => {
    const { result } = renderHook(() => useCourseTracking());

    act(() => result.current.startTracking());
    emit(0, 0);
    emit(1, 60);

    act(() => result.current.pause());
    act(() => result.current.resume());
    deny(); // 재개 실패 — 다음 표본에 찍을 구간 경계 표시가 여기서 사라지면 안 된다

    act(() => result.current.resume());
    emit(10, 600); // 정지 중 약 1km 떨어진 곳으로 이동해 있었다
    emit(11, 60);

    // 정지 전 111m + 재개 후 111m. 경계가 풀리면 그사이 1km가 통째로 더해진다.
    expect(stopAndTakeRecord(result.current.stopTracking)?.distanceKm).toBeLessThan(0.3);
  });
});
