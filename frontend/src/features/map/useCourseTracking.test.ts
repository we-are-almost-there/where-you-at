import { describe, expect, it } from "vitest";
import { getGeolocationErrorMessage, isTerminalGeolocationError } from "./useCourseTracking";

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
