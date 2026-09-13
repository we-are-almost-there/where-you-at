import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_REGIONS_TIMEOUT_MS, fetchActiveRegionCodes } from "./supportApi";

/**
 * 활성 지역 조회의 취소·시간 제한.
 *
 * AbortSignal.timeout / AbortSignal.any는 Safari 17.4에서야 들어왔다. Vite 기본
 * 빌드 대상에는 Safari 16이 있어서, 그 메서드에 기대면 iOS 사용자는 지도에 들어올
 * 때마다 첫 조회가 실패하고 정적 폴백을 보게 된다. 그래서 그 둘이 없는 환경을
 * 만들어 두고 검사한다.
 */
const withoutModernAbort = () => {
  const AnyLess = class extends AbortSignal {};
  // Safari 16처럼 두 정적 메서드가 없는 AbortSignal
  vi.stubGlobal(
    "AbortSignal",
    Object.assign(AnyLess, { any: undefined, timeout: undefined }),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("fetchActiveRegionCodes", () => {
  it("AbortSignal.any가 없는 브라우저에서도 요청을 보낸다", async () => {
    withoutModernAbort();
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(["12780"]) }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outer = new AbortController();
    await expect(fetchActiveRegionCodes(outer.signal)).resolves.toEqual(["12780"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("바깥 신호가 취소되면 요청도 취소된다", async () => {
    withoutModernAbort();
    let passed: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        passed = init.signal as AbortSignal;
        return new Promise((_, reject) => {
          passed!.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }),
    );

    const outer = new AbortController();
    const promise = fetchActiveRegionCodes(outer.signal);
    outer.abort();

    await expect(promise).rejects.toThrow();
    expect(passed!.aborted).toBe(true);
  });

  it("이미 취소된 신호를 받으면 바로 취소 상태로 시작한다", async () => {
    withoutModernAbort();
    let passed: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        passed = init.signal as AbortSignal;
        return Promise.reject(new Error("aborted"));
      }),
    );

    const outer = new AbortController();
    outer.abort(); // 리스너가 울리지 않는 경로

    await expect(fetchActiveRegionCodes(outer.signal)).rejects.toThrow();
    expect(passed!.aborted).toBe(true);
  });

  it("제한 시간을 넘기면 취소한다", async () => {
    withoutModernAbort();
    vi.useFakeTimers();
    let passed: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        passed = init.signal as AbortSignal;
        return new Promise((_, reject) => {
          passed!.addEventListener("abort", () => reject(new Error("timeout")));
        });
      }),
    );

    const promise = fetchActiveRegionCodes();
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(ACTIVE_REGIONS_TIMEOUT_MS);
    await assertion;
    expect(passed!.aborted).toBe(true);
  });

  it("응답을 다 읽고 나면 타이머를 정리해 지연 취소가 남지 않는다", async () => {
    withoutModernAbort();
    vi.useFakeTimers();
    let passed: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        passed = init.signal as AbortSignal;
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }),
    );

    await fetchActiveRegionCodes();
    await vi.advanceTimersByTimeAsync(ACTIVE_REGIONS_TIMEOUT_MS * 2);

    expect(passed!.aborted).toBe(false);
  });
});
