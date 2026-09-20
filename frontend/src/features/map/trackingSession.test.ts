// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { isSavedRecord, readSession, writeSession } from "./trackingSession";

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

const record = { summary: { distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }, routeType: "도보", routePoints: [] };
it.each([{}, { ownerId: 7 }, { ownerId: 7, serverId: 42 }])("기존 형식과 저장 대기·완료 상태를 쓰고 읽어 복원한다: %j", (metadata) => {
  const saved = { ...record, ...metadata };
  expect(isSavedRecord(saved)).toBe(true);
  expect(writeSession("record", saved)).toBe(true);
  const restored = readSession("record");
  expect(isSavedRecord(restored)).toBe(true);
  expect(restored).toEqual(saved);
});

it.each([{ serverId: 42 }, { ownerId: null }, { ownerId: "7" }, { ownerId: -1 },
  { ownerId: 7, serverId: null }, { ownerId: 7, serverId: "42" }, { ownerId: 7, serverId: 0 },
  { ownerId: 7, serverId: 1.5 }, { ownerId: 7, serverId: Number.MAX_SAFE_INTEGER + 1 }])("잘못된 서버 기록 정보는 복원하지 않는다: %j", (metadata) => {
  writeSession("record", { ...record, ...metadata });
  expect(isSavedRecord(readSession("record"))).toBe(false);
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
