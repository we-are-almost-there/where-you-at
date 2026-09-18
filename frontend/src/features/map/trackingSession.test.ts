// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { readSession, writeSession } from "./trackingSession";

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

it("최신 기록 저장 시 용량을 초과하면 이전 저장값을 삭제한다", () => {
  writeSession("tracking-test", { activeMs: 1000 });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage full", "QuotaExceededError");
  });
  expect(() => writeSession("tracking-test", { activeMs: 2000 })).not.toThrow();
  expect(readSession("tracking-test")).toBeNull();
});

it("저장소 쓰기와 삭제가 차단돼도 추적을 중단하지 않는다", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(() => writeSession("tracking-test", { activeMs: 1000 })).not.toThrow();
});
