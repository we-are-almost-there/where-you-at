// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summarize, type TrackingRecord, type RecordPoint } from "./trackingRecord";
import {
  getGeolocationErrorMessage,
  isTerminalGeolocationError,
  useCourseTracking,
  MAX_TRACKING_POINTS,
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
  sessionStorage.clear();
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("빈 초기 세션 삭제가 차단되어도 저장 실패로 표시하지 않는다", () => {
  const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new DOMException("Storage blocked", "SecurityError");
  });
  const hook = renderHook(() => useCourseTracking("blocked-empty"));
  expect(remove).toHaveBeenCalledWith("blocked-empty");
  expect(hook.result.current.status).toBe("idle");
  expect(hook.result.current.storageFailed).toBe(false);
  hook.unmount();
});

it.each(["tracking", "paused"] as const)("%s 세션은 저장소 차단을 알리고 저장 성공 시 해제한다", (status) => {
  const hook = renderHook(() => useCourseTracking("blocked-active"));
  act(() => hook.result.current.startTracking());
  if (status === "paused") act(() => hook.result.current.pause());
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage blocked", "SecurityError");
  });
  const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new DOMException("Storage blocked", "SecurityError");
  });
  act(() => window.dispatchEvent(new Event("pagehide")));
  expect(hook.result.current.status).toBe(status);
  expect(hook.result.current.storageFailed).toBe(true);
  set.mockRestore();
  remove.mockRestore();
  act(() => window.dispatchEvent(new Event("pagehide")));
  expect(hook.result.current.storageFailed).toBe(false);
  hook.unmount();
});

it("12시간 표본을 제한해도 거리·시간·페이스와 새로고침 후 위치를 보존한다", () => {
  const hook = renderHook(() => useCourseTracking("long-test"));
  act(() => hook.result.current.startTracking());
  const points: RecordPoint[] = [];
  const startedAt = now;
  // 1초 간격, 지터·부정확한 표본·GPS 튐을 포함한다.
  act(() => {
    for (let i = 0; i < 12 * 3600; i++) {
      now += 1000;
      const point = { lat: 37.5 + i * 0.00001 + (i % 200 === 0 ? 0.1 : 0), lng: 127,
        accuracy: i % 17 === 0 ? 100 : 10, timestamp: now };
      points.push(point);
      latestWatcher().success({ coords: { latitude: point.lat, longitude: point.lng,
        accuracy: point.accuracy, heading: null }, timestamp: now } as GeolocationPosition);
    }
    window.dispatchEvent(new Event("pagehide"));
  });
  expect(points.length).toBeGreaterThan(MAX_TRACKING_POINTS);
  const expected = summarize(points, now - startedAt);
  expect(hook.result.current.sampleRecord()).toEqual(expected);
  const serialized = sessionStorage.getItem("long-test")!;
  expect(serialized.length * 2).toBeLessThan(2048);
  expect(JSON.parse(serialized).points.length).toBeLessThanOrEqual(1);
  const location = hook.result.current.currentLocation;
  hook.unmount();
  const restored = renderHook(() => useCourseTracking("long-test"));
  expect(restored.result.current.currentLocation).toEqual(location);
  expect(restored.result.current.sampleRecord()).toEqual(expected);
  emit(1000, 10); // 새로고침 동안 이동한 거리는 제외한다.
  expect(restored.result.current.sampleRecord()?.distanceKm).toBe(expected.distanceKm);
  act(() => restored.result.current.pause());
  expect(stopAndTakeRecord(restored.result.current.stopTracking)?.distanceKm).toBe(expected.distanceKm);
  restored.unmount();
});

it("용량 초과를 알리고 주행을 유지하며 다음 저장 성공 시 경고를 해제한다", () => {
  const hook = renderHook(() => useCourseTracking("quota-test"));
  act(() => hook.result.current.startTracking());
  emit(0, 1);
  emit(1, 60);
  const before = hook.result.current.sampleRecord();
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage full", "QuotaExceededError");
  });
  act(() => window.dispatchEvent(new Event("pagehide")));
  expect(hook.result.current.storageFailed).toBe(true);
  expect(hook.result.current.status).toBe("tracking");
  expect(hook.result.current.sampleRecord()).toEqual(before);
  expect(sessionStorage.getItem("quota-test")).toBeNull();
  spy.mockRestore();
  act(() => window.dispatchEvent(new Event("pagehide")));
  expect(hook.result.current.storageFailed).toBe(false);
  hook.unmount();
});

describe("useCourseTracking 권한 거부", () => {
  it("정확도가 나쁜 표본만 쌓인 뒤 권한이 거부돼도 세션을 지킨다", () => {
    const hook = renderHook(() => useCourseTracking("bad-accuracy"));
    act(() => hook.result.current.startTracking());
    act(() => {
      for (let i = 0; i < MAX_TRACKING_POINTS; i++) {
        now += 1000;
        latestWatcher().success({
          coords: { latitude: 37.5, longitude: 127, accuracy: 80, heading: null },
          timestamp: now,
        } as GeolocationPosition);
      }
    });

    deny();

    expect(hook.result.current.status).toBe("paused");
    expect(hook.result.current.currentLocation?.accuracy).toBe(80);
    now += 600_000;
    expect(stopAndTakeRecord(hook.result.current.stopTracking)).toEqual(summarize([], MAX_TRACKING_POINTS * 1000));
    hook.unmount();
  });

  it("정확도가 나쁜 첫 표본을 저장하고 복원해도 권한 거부 시 세션을 지킨다", () => {
    const hook = renderHook(() => useCourseTracking("bad-accuracy-restore"));
    act(() => hook.result.current.startTracking());
    now += 1000;
    act(() => latestWatcher().success({
      coords: { latitude: 37.5, longitude: 127, accuracy: 80, heading: null },
      timestamp: now,
    } as GeolocationPosition));
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(JSON.parse(sessionStorage.getItem("bad-accuracy-restore")!).points).toEqual([
      { lat: 37.5, lng: 127, accuracy: 80, timestamp: now, segmentStart: true },
    ]);
    hook.unmount();

    const restored = renderHook(() => useCourseTracking("bad-accuracy-restore"));
    deny();
    expect(restored.result.current.status).toBe("paused");
    expect(stopAndTakeRecord(restored.result.current.stopTracking)).toEqual(summarize([], 1000));
    restored.unmount();
  });

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

describe("useCourseTracking 진행 중 요약", () => {
  it("시작한 적이 없으면 요약할 것도 없다", () => {
    const { result } = renderHook(() => useCourseTracking());

    expect(result.current.sampleRecord()).toBeNull();
  });

  it("진행 중에는 아직 안 닫힌 구간의 경과 시간까지 포함해 요약한다", () => {
    const { result } = renderHook(() => useCourseTracking());

    act(() => result.current.startTracking());
    emit(0, 0);
    emit(1, 60); // 약 111m를 1분에

    const record = result.current.sampleRecord();
    expect(record?.distanceKm).toBeCloseTo(0.111, 2);
    // 구간을 닫아야만 시간이 잡히면 주행 내내 0분으로 보인다.
    expect(record?.durationMs).toBe(60_000);
  });

  it("일시정지 중에는 시간이 흘러도 활동 시간이 늘지 않는다", () => {
    const { result } = renderHook(() => useCourseTracking());

    act(() => result.current.startTracking());
    emit(0, 0);
    emit(1, 60);

    act(() => result.current.pause());
    now += 600_000; // 주변 정보를 10분 봤다

    const record = result.current.sampleRecord();
    expect(record?.durationMs).toBe(60_000);
    expect(record?.distanceKm).toBeCloseTo(0.111, 2);
  });

  it("종료 직전의 요약과 종료가 돌려주는 기록이 같다", () => {
    const { result } = renderHook(() => useCourseTracking());

    act(() => result.current.startTracking());
    emit(0, 0);
    emit(1, 60);

    // 주행 중 보던 페이스와 기록 카드의 페이스가 어긋나면 둘 중 하나는 거짓말이 된다.
    const sampled = result.current.sampleRecord();
    expect(stopAndTakeRecord(result.current.stopTracking)).toEqual(sampled);
  });
});


describe("세션 복원", () => {
  it("표본이 자주 들어와도 5초마다 저장하고 페이지 이탈이나 숨김 시 즉시 저장한다", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const hook = renderHook(() => useCourseTracking("restore-test"));
    act(() => hook.result.current.startTracking());
    setItem.mockClear();
    for (let i = 0; i < 10; i++) {
      emit(i, 0.5);
      act(() => { vi.advanceTimersByTime(500); });
    }
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem("restore-test")!).activeMs).toBe(5000);
    emit(10, 0.5);
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(setItem).toHaveBeenCalledTimes(2);
    expect(JSON.parse(sessionStorage.getItem("restore-test")!).activeMs).toBe(5500);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    emit(11, 0.5);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(setItem).toHaveBeenCalledTimes(3);
    expect(JSON.parse(sessionStorage.getItem("restore-test")!).activeMs).toBe(6000);
    act(() => hook.result.current.pause());
    expect(setItem).toHaveBeenCalledTimes(4);
    expect(JSON.parse(sessionStorage.getItem("restore-test")!).status).toBe("paused");
    hook.unmount();
  });

  it.each(["tracking", "paused"] as const)("%s 상태를 복원할 때 새로고침 시간을 더하거나 이동 구간을 연결하지 않는다", (status) => {
    const first = renderHook(() => useCourseTracking("restore-test"));
    act(() => first.result.current.startTracking());
    emit(0, 0);
    emit(1, 60);
    if (status === "paused") act(() => first.result.current.pause());
    act(() => window.dispatchEvent(new Event("pagehide")));
    const before = first.result.current.sampleRecord()!;
    const lastLocation = first.result.current.currentLocation;
    expect(JSON.parse(sessionStorage.getItem("restore-test")!).currentLocation).toEqual(lastLocation);
    first.unmount();
    now += 600_000;
    const restored = renderHook(() => useCourseTracking("restore-test"));
    expect(restored.result.current.status).toBe(status);
    expect(restored.result.current.currentLocation).toEqual(lastLocation);
    expect(restored.result.current.sampleRecord()).toEqual(before);
    expect(watchers).toHaveLength(status === "tracking" ? 2 : 1);
    if (status === "paused") act(() => restored.result.current.resume());
    emit(10, 0);
    expect(restored.result.current.sampleRecord()?.distanceKm).toBe(before.distanceKm);
    emit(11, 60);
    const record = stopAndTakeRecord(restored.result.current.stopTracking)!;
    expect(record.distanceKm).toBeCloseTo(before.distanceKm * 2);
    expect(record.durationMs).toBe(before.durationMs + 60_000);
    expect(sessionStorage.getItem("restore-test")).toBeNull();
    restored.unmount();
  });

  it("손상된 저장값은 무시한다", () => {
    sessionStorage.setItem("restore-test", "{broken");
    const hook = renderHook(() => useCourseTracking("restore-test"));
    expect(hook.result.current.status).toBe("idle");
    hook.unmount();
  });

  it.each([undefined, { lat: 999, lng: 127, accuracy: 10, heading: 0 }])(
    "저장 위치가 없거나 손상되면 마지막 기록 표본을 복원한다: %j",
    (currentLocation) => {
      sessionStorage.setItem("restore-test", JSON.stringify({
        points: [{ lat: 37.5, lng: 127, accuracy: 10, timestamp: now }],
        activeMs: 60_000, status: "paused", currentLocation,
      }));
      const hook = renderHook(() => useCourseTracking("restore-test"));
      expect(hook.result.current.currentLocation).toEqual({ lat: 37.5, lng: 127, accuracy: 10, heading: null });
      expect(hook.result.current.status).toBe("paused");
      expect(watchers).toHaveLength(0);
      expect(hook.result.current.sampleRecord()?.durationMs).toBe(60_000);
      hook.unmount();
    },
  );

  it("저장된 이동 방향도 복원하고 종료 시 위치와 저장값을 지운다", () => {
    const location = { lat: 37.5, lng: 127, accuracy: 10, heading: 90 };
    sessionStorage.setItem("restore-test", JSON.stringify({
      points: [], activeMs: 1000, status: "paused", currentLocation: location,
    }));
    const hook = renderHook(() => useCourseTracking("restore-test"));
    expect(hook.result.current.currentLocation).toEqual(location);
    expect(watchers).toHaveLength(0);
    act(() => hook.result.current.stopTracking());
    expect(hook.result.current.currentLocation).toBeNull();
    expect(sessionStorage.getItem("restore-test")).toBeNull();
    hook.unmount();
  });

  it("저장된 위치와 표본이 모두 없으면 위치를 만들지 않는다", () => {
    sessionStorage.setItem("restore-test", JSON.stringify({ points: [], activeMs: 0, status: "paused" }));
    const hook = renderHook(() => useCourseTracking("restore-test"));
    expect(hook.result.current.currentLocation).toBeNull();
    expect(watchers).toHaveLength(0);
    hook.unmount();
  });
});


it("StrictMode에서 복원해도 활성 위치 감시는 하나만 유지하고 이전 콜백은 무시한다", () => {
  sessionStorage.setItem("restore-test", JSON.stringify({
    points: [], activeMs: 1000, status: "tracking", savedAt: now,
  }));
  const hook = renderHook(() => useCourseTracking("restore-test"), {
    reactStrictMode: true,
  });
  expect(watchers).toHaveLength(2);
  expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(1);
  act(() => watchers[0].error({ code: 1 } as GeolocationPositionError));
  expect(hook.result.current.status).toBe("tracking");
  emit(0, 0);
  act(() => hook.result.current.pause());
  emit(1, 60);
  expect(hook.result.current.sampleRecord()?.distanceKm).toBe(0);
  hook.unmount();
});

it("종료한 세션은 주기적 저장이나 페이지 이탈로 되살아나지 않는다", () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const hook = renderHook(() => useCourseTracking("restore-test"));
  act(() => hook.result.current.startTracking());
  emit(0, 0);
  expect(sessionStorage.getItem("restore-test")).not.toBeNull();
  act(() => {
    hook.result.current.stopTracking();
    sessionStorage.removeItem("restore-test");
    // 상태 변경이 렌더에 반영되기 전에도 기존 인터벌이 실행될 수 있다.
    vi.advanceTimersByTime(2000);
    window.dispatchEvent(new Event("pagehide"));
    expect(sessionStorage.getItem("restore-test")).toBeNull();
  });
  hook.unmount();
});


it.each([30 * 60_000, 24 * 60 * 60_000, null, -1000])(
  "저장 시각이 오래됐거나 없거나 미래이면 일시정지로 복원한다: %s",
  (age) => {
    sessionStorage.setItem("restore-test", JSON.stringify({
      points: [
        { lat: 37.5, lng: 127, accuracy: 10, timestamp: now - 60_000 },
        { lat: 37.501, lng: 127, accuracy: 10, timestamp: now },
      ],
      activeMs: 60_000, status: "tracking",
      ...(age !== null && { savedAt: now - age }),
    }));
    const hook = renderHook(() => useCourseTracking("restore-test"));
    expect(hook.result.current.status).toBe("paused");
    expect(watchers).toHaveLength(0);
    expect(hook.result.current.sampleRecord()?.durationMs).toBe(60_000);
    act(() => hook.result.current.resume());
    expect(watchers).toHaveLength(1);
    expect(hook.result.current.status).toBe("tracking");
    emit(10, 0);
    expect(hook.result.current.sampleRecord()?.distanceKm).toBeLessThan(0.2);
    hook.unmount();
  },
);
