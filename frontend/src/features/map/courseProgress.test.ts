import { describe, expect, it } from "vitest";
import { advanceProgress, distanceToCourse, rawProgress } from "./courseProgress";
import type { LatLng } from "./types";

// 같은 위도에서 경도만 균등 간격으로 벌린 5개 지점 → 구간 길이가 모두 같아
// 진행률이 인덱스에 정확히 비례한다(0 / 25 / 50 / 75 / 100).
const LINE: LatLng[] = [
  { lat: 35.0, lng: 129.0 },
  { lat: 35.0, lng: 129.01 },
  { lat: 35.0, lng: 129.02 },
  { lat: 35.0, lng: 129.03 },
  { lat: 35.0, lng: 129.04 },
];

const LOOP: LatLng[] = [
  { lat: 35.0, lng: 129.0 },
  { lat: 35.01, lng: 129.0 },
  { lat: 35.01, lng: 129.01 },
  { lat: 35.0, lng: 129.0 },
];

describe("rawProgress (forward)", () => {
  it("시작점 근처는 0%", () => {
    expect(rawProgress(LINE, LINE[0], "forward")).toBeCloseTo(0, 5);
  });

  it("중간 지점은 50%", () => {
    expect(rawProgress(LINE, LINE[2], "forward")).toBeCloseTo(50, 5);
  });

  it("도착점 근처는 100%", () => {
    expect(rawProgress(LINE, LINE[4], "forward")).toBeCloseTo(100, 5);
  });

  it("경로 밖(옆으로 벗어난) 위치도 가장 가까운 지점 기준으로 0~100 안에서 환산", () => {
    const offRoute: LatLng = { lat: 35.002, lng: 129.02 }; // 중간 지점 바로 옆
    const p = rawProgress(LINE, offRoute, "forward");
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(100);
    expect(p).toBeCloseTo(50, 5); // 가장 가까운 건 여전히 중간 지점
  });
});

describe("rawProgress (reverse)", () => {
  it("도착점 근처는 0%", () => {
    expect(rawProgress(LINE, LINE[4], "reverse")).toBeCloseTo(0, 5);
  });

  it("시작점 근처는 100%", () => {
    expect(rawProgress(LINE, LINE[0], "reverse")).toBeCloseTo(100, 5);
  });

  it("첫 좌표와 마지막 좌표가 같은 순환 코스도 역방향 출발점은 0%", () => {
    expect(rawProgress(LOOP, LOOP[LOOP.length - 1], "reverse")).toBeCloseTo(0, 5);
  });
});

describe("rawProgress (빈/단일 GPX)", () => {
  it("빈 GPX는 0%", () => {
    expect(rawProgress([], LINE[0], "forward")).toBe(0);
  });

  it("지점이 1개뿐이면 0%", () => {
    expect(rawProgress([LINE[0]], LINE[0], "forward")).toBe(0);
  });
});

describe("distanceToCourse", () => {
  it("코스 위 지점은 0m", () => {
    expect(distanceToCourse(LINE, LINE[2])).toBeCloseTo(0, 5);
  });

  it("코스에서 벗어난 지점은 가장 가까운 지점까지의 거리", () => {
    // 위도 0.002° ≈ 222m 북쪽으로 벗어난 위치
    const d = distanceToCourse(LINE, { lat: 35.002, lng: 129.02 });
    expect(d).toBeGreaterThan(200);
    expect(d).toBeLessThan(240);
  });

  it("아주 먼 곳은 큰 값(수십 km)", () => {
    expect(distanceToCourse(LINE, { lat: 37.5665, lng: 126.978 })).toBeGreaterThan(300_000);
  });

  it("빈 GPX는 Infinity", () => {
    expect(distanceToCourse([], LINE[0])).toBe(Infinity);
  });
});

describe("advanceProgress (최고 진행률 유지)", () => {
  it("이전 위치로 되돌아가도(뒤 인덱스) 진행률이 감소하지 않는다", () => {
    // 직전 80%인 상태에서 25% 지점으로 후퇴 → 80% 유지
    expect(advanceProgress(80, LINE, LINE[1], "forward")).toBeCloseTo(80, 5);
  });

  it("더 진행하면 갱신된다", () => {
    // 직전 25%인 상태에서 75% 지점 → 75%로 상승
    expect(advanceProgress(25, LINE, LINE[3], "forward")).toBeCloseTo(75, 5);
  });

  it.each(["forward", "reverse"] as const)(
    "순환 코스의 도착점은 %s 방향에서 100%로 완료된다",
    (direction) => {
      expect(advanceProgress(75, LOOP, LOOP[0], direction)).toBeCloseTo(100, 5);
    },
  );
});
