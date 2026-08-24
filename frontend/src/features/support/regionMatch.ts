import type { Feature, FeatureCollection } from "geojson";

/**
 * 시군구 도형(korea-all-regions.json)을 시도·지원지역과 이어 붙인다.
 *
 * 세 파일의 코드 체계가 서로 다르다.
 *  - korea-all-regions.json : 통계청(KOSTAT) 시군구 코드 (강진군 36590)
 *  - support-regions-geo.json / DB : 법정동 기반 프로젝트 코드 (강진군 12780)
 *  - korea-sido.json : 시도 코드 (전남광주통합특별시 12)
 * 그래서 코드로 잇지 못하고, 도형 안에 점이 들어가는지로(point-in-polygon) 맞춘다.
 * 지원지역 88건 전부 이름까지 일치하는 것을 확인했다.
 */

export type RegionEntry = {
  feature: Feature;
  /** 시군구 이름 (KOSTAT 원본 표기) */
  name: string;
  /** 이 시군구가 속한 시도 코드. 드릴다운 필터에 쓴다. */
  sidoCode: string | null;
  /** 지원 대상이면 프로젝트 지역 코드, 아니면 null */
  supportCode: string | null;
};

type BBox = [number, number, number, number]; // minX, minY, maxX, maxY

const polysOf = (geom: any): number[][][][] =>
  geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];

function bboxOf(geom: any): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polysOf(geom))
    for (const ring of poly)
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  return [minX, minY, maxX, maxY];
}

const inBBox = (p: number[], b: BBox) =>
  p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

function inRing(p: number[], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** 외곽 링 안에 있으면서 구멍에는 안 들어간 점 */
const inPolygon = (p: number[], poly: number[][][]) =>
  inRing(p, poly[0]) && !poly.slice(1).some((hole) => inRing(p, hole));

const inGeometry = (p: number[], geom: any) =>
  polysOf(geom).some((poly) => inPolygon(p, poly));

/**
 * 도형 안에 확실히 들어가는 점 하나.
 * 초승달처럼 오목한 시군구는 정점 평균이 도형 밖으로 나갈 수 있어,
 * 그때는 외곽 링의 정점들과 평균점으로 만든 삼각형 중점들을 훑어 대체점을 찾는다.
 */
function interiorPoint(geom: any): number[] {
  let best: number[][][] | null = null;
  let bestLen = 0;
  for (const poly of polysOf(geom)) {
    if (poly[0].length > bestLen) {
      bestLen = poly[0].length;
      best = poly;
    }
  }
  const ring = best![0];
  let sx = 0, sy = 0;
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
  }
  const mid = [sx / ring.length, sy / ring.length];
  if (inPolygon(mid, best!)) return mid;

  const step = Math.max(1, Math.floor(ring.length / 60));
  for (let i = 0; i < ring.length - 2; i += step) {
    const p = [
      (ring[i][0] + ring[i + 2][0] + mid[0]) / 3,
      (ring[i][1] + ring[i + 2][1] + mid[1]) / 3,
    ];
    if (inPolygon(p, best!)) return p;
  }
  return mid;
}

/**
 * 시군구마다 시도 코드와 지원지역 코드를 붙인 목록을 만든다.
 * 데이터가 바뀌지 않는 한 결과가 같으므로 호출부에서 한 번만 계산해 재사용한다.
 */
export function buildRegionIndex(
  allRegions: FeatureCollection,
  sido: FeatureCollection,
  support: FeatureCollection,
): RegionEntry[] {
  const regionBoxes = allRegions.features.map((f) => bboxOf(f.geometry));
  const regionPoints = allRegions.features.map((f) => interiorPoint(f.geometry));
  const sidoBoxes = sido.features.map((f) => bboxOf(f.geometry));

  // 1) 시군구 → 시도
  const sidoCodes = regionPoints.map((p) => {
    for (let i = 0; i < sido.features.length; i++) {
      if (!inBBox(p, sidoBoxes[i])) continue;
      if (inGeometry(p, sido.features[i].geometry)) {
        return String((sido.features[i].properties as any).sido_code);
      }
    }
    // 경계선에 걸친 섬 등 — 가장 가까운 시도로 보낸다 (드릴다운에서 누락되지 않게)
    let nearest: string | null = null;
    let best = Infinity;
    sidoBoxes.forEach((b, i) => {
      const cx = (b[0] + b[2]) / 2;
      const cy = (b[1] + b[3]) / 2;
      const d = Math.hypot(p[0] - cx, p[1] - cy);
      if (d < best) {
        best = d;
        nearest = String((sido.features[i].properties as any).sido_code);
      }
    });
    return nearest;
  });

  // 2) 지원지역 → 시군구 (지원지역 쪽 내부점이 어느 도형에 들어가는지)
  const supportCodes: (string | null)[] = new Array(allRegions.features.length).fill(null);
  for (const f of support.features) {
    const p = interiorPoint(f.geometry);
    for (let i = 0; i < allRegions.features.length; i++) {
      if (!inBBox(p, regionBoxes[i])) continue;
      if (inGeometry(p, allRegions.features[i].geometry)) {
        supportCodes[i] = String((f.properties as any).region_code);
        break;
      }
    }
  }

  return allRegions.features.map((feature, i) => ({
    feature,
    name: String((feature.properties as any)?.name ?? ""),
    sidoCode: sidoCodes[i],
    supportCode: supportCodes[i],
  }));
}
