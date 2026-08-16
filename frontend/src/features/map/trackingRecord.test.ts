import { describe, expect, it } from "vitest";
import {
  accumulateDistanceMeters,
  formatDistance,
  formatDuration,
  formatPace,
  summarize,
  type RecordPoint,
} from "./trackingRecord";

// 위도 0.001도 ≈ 111m. 표본을 만들 때 이 간격으로 북쪽으로 옮긴다.
function point(index: number, over: Partial<RecordPoint> = {}): RecordPoint {
  return {
    lat: 37.5 + index * 0.001,
    lng: 127.0,
    accuracy: 10,
    timestamp: 1_000_000 + index * 60_000, // 표본 간 60초
    ...over,
  };
}

describe("accumulateDistanceMeters", () => {
  it("표본이 0~1개면 0을 반환한다", () => {
    expect(accumulateDistanceMeters([])).toBe(0);
    expect(accumulateDistanceMeters([point(0)])).toBe(0);
  });

  it("연속한 표본의 거리를 누적한다", () => {
    const meters = accumulateDistanceMeters([point(0), point(1), point(2)]);
    expect(meters).toBeGreaterThan(200);
    expect(meters).toBeLessThan(230);
  });

  it("정확도가 나쁜 표본은 빼고 계산한다", () => {
    const withBad = accumulateDistanceMeters([point(0), point(1, { accuracy: 80 }), point(2)]);
    expect(withBad).toBeCloseTo(accumulateDistanceMeters([point(0), point(2)]), 5);
  });

  it("제자리 지터는 거리로 세지 않는다", () => {
    const jitter = Array.from({ length: 20 }, (_, i) => ({
      ...point(0),
      lat: 37.5 + (i % 2) * 0.00001, // 약 1m 왕복
      timestamp: 1_000_000 + i * 5_000,
    }));
    expect(accumulateDistanceMeters(jitter)).toBe(0);
  });

  it("시각이 흐르지 않은 표본은 속도를 잴 수 없어 버린다", () => {
    // 같은 timestamp로 111m 떨어진 좌표가 오는 기기가 있다. 속도 검사를 건너뛰면 그대로 더해진다.
    const sameTime = { ...point(1), timestamp: point(0).timestamp };
    expect(accumulateDistanceMeters([point(0), sameTime])).toBe(0);
  });

  it("비현실적으로 빠른 튐은 버리고 기준점을 유지한다", () => {
    // 1초 만에 111m(=400km/h) 떨어진 곳으로 튀었다가 제자리로 돌아온 표본
    const spike = { ...point(50), timestamp: 1_000_001 };
    const withSpike = accumulateDistanceMeters([point(0), spike, point(1)]);
    expect(withSpike).toBeCloseTo(accumulateDistanceMeters([point(0), point(1)]), 5);
  });
});

describe("summarize", () => {
  it("거리·시간·평균 페이스를 계산한다", () => {
    const record = summarize([point(0), point(1)], 1_000_000, 1_000_000 + 60_000);
    expect(record.durationMs).toBe(60_000);
    expect(record.distanceKm).toBeGreaterThan(0.1);
    // 약 111m를 60초 → 1km당 약 540초
    expect(record.paceSecPerKm).toBeGreaterThan(500);
    expect(record.paceSecPerKm).toBeLessThan(580);
  });

  it("거의 움직이지 않았으면 페이스를 내지 않는다", () => {
    expect(summarize([point(0)], 1_000_000, 1_000_060).paceSecPerKm).toBeNull();
  });

  it("종료 시각이 시작보다 앞서도 음수 시간이 되지 않는다", () => {
    expect(summarize([], 2_000_000, 1_000_000).durationMs).toBe(0);
  });
});

describe("포맷", () => {
  it("거리는 소수 둘째 자리까지 쓴다", () => {
    expect(formatDistance(5.006)).toBe("5.01");
    expect(formatDistance(0)).toBe("0.00");
  });

  it.each([
    [379, "6'19\""],
    [360, "6'00\""],
    [null, "--'--\""],
  ])("페이스 %s초/km를 표기한다", (sec, expected) => {
    expect(formatPace(sec)).toBe(expected);
  });

  it.each([
    [2003_000, "33:23"],
    [3688_000, "1:01:28"],
    [0, "0:00"],
  ])("시간 %ims를 표기한다", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});
