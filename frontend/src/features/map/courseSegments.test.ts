import { describe, it, expect } from "vitest";
import { splitIntoSegments } from "./courseSegments";
import type { LatLng } from "./types";

// 위도 1도 ≈ 111km. 원하는 간격(km)으로 남북 일직선 좌표를 만든다.
function line(count: number, stepKm: number, startLat = 33.5): LatLng[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: startLat + (i * stepKm) / 111,
    lng: 126.5,
  }));
}

describe("splitIntoSegments", () => {
  it("원본 GPX처럼 촘촘한 좌표는 한 덩어리로 둔다", () => {
    // 점 간격 20m — 두루누비 도보 코스 수준
    expect(splitIntoSegments(line(50, 0.02))).toHaveLength(1);
  });

  it("촘촘한 좌표 중간의 pen-up gap에서는 끊는다", () => {
    // 20m 간격으로 가다가 한 번 10km 점프 (국토종주 자전거길 지선 구간)
    const pts = [...line(20, 0.02), ...line(20, 0.02, 34.5)];
    expect(splitIntoSegments(pts)).toHaveLength(2);
  });

  it("간략화된 좌표(점 간격이 km 단위)를 조각내지 않는다", () => {
    // 제주환상자전거길 232.7km를 40점으로 솎으면 점 간격이 약 5.8km가 된다.
    // 고정 3km 기준이던 시절 이 경로는 40조각으로 끊겨 지도에 선이 사라졌다.
    expect(splitIntoSegments(line(40, 5.8))).toHaveLength(1);
  });

  it("간격이 넓은 좌표에서도 유독 튀는 gap은 끊는다", () => {
    // 평소 5.8km 간격인데 한 번만 100km 점프하면 그건 진짜 끊긴 구간이다
    const pts = [...line(20, 5.8), ...line(20, 5.8, 40)];
    expect(splitIntoSegments(pts)).toHaveLength(2);
  });

  it("빈 배열과 점 하나를 안전하게 처리한다", () => {
    expect(splitIntoSegments([])).toEqual([]);
    expect(splitIntoSegments(line(1, 1))).toHaveLength(1);
  });
});
