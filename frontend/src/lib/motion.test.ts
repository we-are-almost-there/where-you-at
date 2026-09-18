// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion, smoothScrollBehavior, usePrefersReducedMotion } from "./motion";

/** prefers-reduced-motion 질의만 흉내 내고, 바꾸면 change 이벤트를 보낸다. */
function stubReducedMotion(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const matchMedia = vi.fn((query: string) => ({
    get matches() {
      return query === "(prefers-reduced-motion: reduce)" && matches;
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    matchMedia,
    set(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("motion", () => {
  it("동작 줄이기 설정이면 JS 스크롤을 즉시 이동으로 바꾼다", () => {
    const media = stubReducedMotion(true);

    expect(prefersReducedMotion()).toBe(true);
    expect(smoothScrollBehavior()).toBe("auto");
    expect(media.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("설정이 없으면 부드럽게 스크롤한다", () => {
    stubReducedMotion(false);

    expect(smoothScrollBehavior()).toBe("smooth");
  });

  it("쓰는 도중 설정이 바뀌면 다시 그린다", () => {
    const media = stubReducedMotion(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => media.set(true));

    expect(result.current).toBe(true);
  });
});
