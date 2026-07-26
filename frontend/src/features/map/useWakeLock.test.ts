import { describe, expect, it } from "vitest";
import { shouldRequestWakeLock } from "./useWakeLock";

describe("shouldRequestWakeLock", () => {
  it("추적 중이고 화면이 보이며 아직 잠금이 없으면 요청한다", () => {
    expect(shouldRequestWakeLock(true, "visible", false)).toBe(true);
  });

  it("추적 중이 아니면 요청하지 않는다", () => {
    expect(shouldRequestWakeLock(false, "visible", false)).toBe(false);
  });

  it("화면이 가려진 동안에는 요청하지 않는다", () => {
    expect(shouldRequestWakeLock(true, "hidden", false)).toBe(false);
  });

  it("이미 잠금을 쥐고 있으면 중복 요청하지 않는다", () => {
    expect(shouldRequestWakeLock(true, "visible", true)).toBe(false);
  });
});
