import { readFileSync } from "node:fs";
import type { FeatureCollection, Geometry, Position } from "geojson";
import { describe, expect, it } from "vitest";
import { labelPoint } from "./koreaMapGeometry";
import { polygonsOf } from "./regionMatch";

const regions = JSON.parse(
  readFileSync(new URL("../../../public/korea-all-regions.json", import.meta.url), "utf8"),
) as FeatureCollection;

function inRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const inGeometry = (point: Position, geometry: Geometry) =>
  polygonsOf(geometry).some(
    (polygon) =>
      inRing(point, polygon[0]) &&
      !polygon.slice(1).some((hole) => inRing(point, hole)),
  );

describe("koreaMapGeometry labelPoint", () => {
  it("오목한 실제 도형인 사천시에서도 라벨 위치를 행정구역 안에 둔다", () => {
    const sacheon = regions.features.find(
      (feature) => String(feature.properties?.sgg_code) === "48240",
    );
    expect(sacheon).toBeTruthy();

    // 사천시는 인셋 창 안에 있어 항등 투영으로도 실제 경위도 영역 포함 여부를 검사할 수 있다.
    const point = labelPoint(sacheon!.geometry, ([x, y]) => [x, y]);

    expect(inGeometry(point, sacheon!.geometry)).toBe(true);
  });
});
