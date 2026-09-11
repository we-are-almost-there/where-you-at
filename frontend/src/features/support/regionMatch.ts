import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

/**
 * 시군구 도형(korea-all-regions.json)에 시도 코드와 DB 지역 코드를 붙인다.
 *
 * 파일마다 코드 체계가 다르다.
 *  - korea-all-regions.json : 통계청(KOSTAT) 시군구 코드 (강진군 36590)
 *  - DB region 테이블       : 법정동 기반 프로젝트 코드 (강진군 12780)
 *  - korea-sido.json        : 시도 코드 (전남광주통합특별시 12)
 *
 * 시도는 도형 안에 점이 들어가는지로(point-in-polygon) 맞춘다.
 * 지역 코드는 미리 만들어 둔 대응표(region-index.json)를 쓴다 — 전국 시군구를
 * 모두 담고 있어서, 어떤 지역에 제도가 새로 생겨도 색칠 대상이 될 수 있다.
 * 대응표는 scripts/build-region-index.mjs가 같은 규칙으로 생성한다.
 *
 * "어느 지역이 지원 대상인가"는 여기서 정하지 않는다. 그건 API 응답이냐 정적 파일이냐에
 * 따라 달라지고 재조회로 바뀔 수도 있어서, 도형 계산과 분리해 호출부가 정하게 둔다.
 */

export type RegionEntry = {
  feature: Feature;
  /** 시군구 이름 (KOSTAT 원본 표기) */
  name: string;
  /** 이 시군구가 속한 시도 코드. 드릴다운 필터에 쓴다. */
  sidoCode: string | null;
  /** 이 시군구의 DB 지역 코드. 대응표에 없으면 null (행정 개편 전 도형 등) */
  regionCode: string | null;
};

/** KOSTAT 시군구 코드 → DB 지역 코드 */
export type RegionCodeMap = Readonly<Record<string, string>>;

/**
 * public/region-index.json. scripts/build-region-index.mjs가 만든다.
 * 지역 코드·이름·지원 대상 목록을 한 파일에 담아, 762KB짜리 지원지역 GeoJSON을
 * 받지 않고도 지도 색칠과 패널 제목을 채울 수 있게 한다.
 */
export type RegionIndex = {
  /** 도형(sgg_code) → DB 지역 코드 */
  byShape: RegionCodeMap;
  /**
   * DB 지역 코드 → 지역명. 시도명이 앞에 붙는다('전라남도 완도군').
   * '서구'·'동구'처럼 여러 도에 같은 이름이 있어, 시군구 이름만으로는 패널 제목이
   * 어디를 가리키는지 알 수 없기 때문이다. 시도와 이름이 같은 세종은 붙이지 않는다.
   * 지도 배지는 이 값이 아니라 도형 파일의 이름을 쓴다.
   */
  names: Readonly<Record<string, string>>;
  /** 지원 대상이 될 수 있는 지역(인구감소지역). 활성 지역 조회 실패 시 폴백 */
  supportRegions: readonly string[];
};

type BBox = [number, number, number, number]; // minX, minY, maxX, maxY

/**
 * 도형을 폴리곤(0번=외곽 링, 나머지=구멍) 배열로 편다.
 * Polygon·MultiPolygon만 다루고 그 외 도형은 빈 배열 — 지금 쓰는 세 파일은 전부 면이다.
 * 지도 그리기(SupportRegionMap)도 같은 함수를 거쳐야 좌표계가 어긋나지 않는다.
 */
export const polygonsOf = (geom: Geometry): Position[][][] =>
  geom.type === "MultiPolygon"
    ? geom.coordinates
    : geom.type === "Polygon"
      ? [geom.coordinates]
      : [];

function bboxOf(geom: Geometry): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polygonsOf(geom))
    for (const ring of poly)
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  return [minX, minY, maxX, maxY];
}

const inBBox = (p: Position, b: BBox) =>
  p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

function inRing(p: Position, ring: Position[]): boolean {
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
const inPolygon = (p: Position, poly: Position[][]) =>
  inRing(p, poly[0]) && !poly.slice(1).some((hole) => inRing(p, hole));

const inGeometry = (p: Position, geom: Geometry) =>
  polygonsOf(geom).some((poly) => inPolygon(p, poly));

/**
 * 도형 안에 확실히 들어가는 점 하나.
 * 초승달처럼 오목한 시군구는 정점 평균이 도형 밖으로 나갈 수 있어,
 * 그때는 외곽 링의 정점들과 평균점으로 만든 삼각형 중점들을 훑어 대체점을 찾는다.
 */
function interiorPoint(geom: Geometry): Position {
  let best: Position[][] | null = null;
  let bestLen = 0;
  for (const poly of polygonsOf(geom)) {
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
 * 시군구마다 시도 코드와 DB 지역 코드를 붙인 목록을 만든다.
 *
 * 도형 계산(point-in-polygon)이 들어 있어 값싸지 않다. 입력이 전부 정적 파일이라
 * 결과가 바뀌지 않으므로 호출부에서 한 번만 계산해 재사용한다.
 * 지원 대상 여부는 여기서 정하지 않으므로, 활성 지역을 다시 조회해도 이 계산은
 * 다시 돌 필요가 없다.
 */
export function buildRegionIndex(
  allRegions: FeatureCollection,
  sido: FeatureCollection,
  codeMap: RegionCodeMap,
): RegionEntry[] {
  const regionPoints = allRegions.features.map((f) => interiorPoint(f.geometry));
  const sidoBoxes = sido.features.map((f) => bboxOf(f.geometry));

  // 1) 시군구 → 시도
  const sidoCodeOf = (f: Feature) => String(f.properties?.sido_code);

  const sidoCodes = regionPoints.map((p) => {
    for (let i = 0; i < sido.features.length; i++) {
      if (!inBBox(p, sidoBoxes[i])) continue;
      if (inGeometry(p, sido.features[i].geometry)) {
        return sidoCodeOf(sido.features[i]);
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
        nearest = sidoCodeOf(sido.features[i]);
      }
    });
    return nearest;
  });

  // 2) 시군구 → DB 지역 코드 (대응표 조회)
  return allRegions.features.map((feature, i) => ({
    feature,
    name: String(feature.properties?.name ?? ""),
    sidoCode: sidoCodes[i],
    regionCode: codeMap[String(feature.properties?.sgg_code)] ?? null,
  }));
}
