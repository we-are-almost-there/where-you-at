import type { Geometry, Position } from "geojson";
import { polygonsOf } from "./regionMatch";

// 우리나라 행정구역 GeoJSON을 SVG로 그리는 좌표 계산.
// 방문 혜택 지도(SupportRegionMap)와 마이페이지 스탬프 지도가 같이 쓴다.
// 도형 파일은 public/korea-sido.json(시도)·korea-all-regions.json(시군구)이다.

// viewBox는 고정하지 않고 그리는 대상의 비율에 맞춰 뷰마다 계산한다.
// 고정하면 가로로 긴 도(강원 등)에서 위아래에 큰 죽은 여백이 생긴다.
// VIEW_BASE는 긴 변의 크기(패딩 제외) — 좌표 정밀도 기준일 뿐 화면 크기와는 무관하다.
export const VIEW_BASE = 780;
const PAD = 10;

// 본토를 크게 그리기 위한 인셋. 전국뷰 bbox가 울릉도(130.9°E)·백령도(124.6°E)·
// 제주(33.1°N) 때문에 부풀어서, 본토가 실제로 쓸 수 있는 폭의 3분의 2로 그려지고 있었다.
// 창(WINDOW) 안쪽 좌표는 손대지 않고, 밖으로 나간 거리만 압축해 창 쪽으로 붙인다.
// 종이 지도가 울릉도·제주를 인셋 박스로 빼는 것과 같은 관례 — 지리 비율은 의도적으로 포기한다.
// 압축률은 경도·위도를 따로 둔다. 좌우(울릉도·백령도)는 세게 당겨 가로 낭비를 줄이고,
// 제주는 약하게 당겨 본토와 충분히 떨어진 남쪽에 남긴다.
const WINDOW_LNG: [number, number] = [125.6, 129.7];
const WINDOW_LAT: [number, number] = [34.2, 38.7];
const INSET_COMPRESS_LNG = 0.16;
const INSET_COMPRESS_LAT = 0.5;

// 등장방형 보정. 위도 36°(본토 중심)에서 경도 1°는 위도 1°의 약 0.81배 거리라,
// 보정하지 않으면 본토가 가로로 1.2배 늘어난다.
const COS_LAT0 = Math.cos((36 * Math.PI) / 180);

function clampToWindow(v: number, [lo, hi]: [number, number], compress: number): number {
  if (v < lo) return lo + (v - lo) * compress;
  if (v > hi) return hi + (v - hi) * compress;
  return v;
}

/**
 * 폴리곤을 인셋 규칙에 맞춰 옮긴 링 배열로 편다.
 * 좌표를 하나씩 압축하면 섬 모양이 찌그러지므로, 폴리곤 중심의 이동량만큼
 * 링 전체를 평행이동해 모양과 구멍 정렬을 그대로 유지한다.
 * bbox 계산과 path 생성이 반드시 같은 함수를 거쳐야 좌표계가 어긋나지 않는다.
 */
export function insetRings(geom: Geometry): Position[][] {
  const rings: Position[][] = [];
  for (const poly of polygonsOf(geom)) {
    const shell = poly[0];
    let sx = 0, sy = 0;
    for (const [lng, lat] of shell) { sx += lng; sy += lat; }
    const cx = sx / shell.length;
    const cy = sy / shell.length;
    const dLng = clampToWindow(cx, WINDOW_LNG, INSET_COMPRESS_LNG) - cx;
    const dLat = clampToWindow(cy, WINDOW_LAT, INSET_COMPRESS_LAT) - cy;
    if (dLng === 0 && dLat === 0) {
      for (const ring of poly) rings.push(ring);
    } else {
      for (const ring of poly) rings.push(ring.map(([lng, lat]) => [lng + dLng, lat + dLat]));
    }
  }
  return rings;
}

export type Projection = (point: Position) => [number, number];

/**
 * 그릴 도형들의 경위도 범위에 맞춘 투영과 viewBox 크기 (전국이든 시도든).
 * 인셋을 적용한 좌표 기준으로 bbox를 잡으므로, project에 넘기는 좌표도
 * 반드시 insetRings를 통과한 값이어야 한다.
 */
export function buildProjection(geometries: Geometry[]): { project: Projection | null; viewW: number; viewH: number } {
  if (!geometries.length) {
    return { project: null, viewW: VIEW_BASE, viewH: VIEW_BASE };
  }
  let minX = Infinity, maxX = -Infinity, minLat = Infinity, maxLat = -Infinity;
  geometries.forEach((geometry) => {
    insetRings(geometry).forEach((ring) =>
      ring.forEach(([lng, lat]) => {
        const x = lng * COS_LAT0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }),
    );
  });
  const dX = maxX - minX;
  const dY = maxLat - minLat;
  // 긴 변을 VIEW_BASE에 맞추고, 짧은 변은 비율대로 — viewBox가 콘텐츠에 딱 맞으니 여백이 없다
  const scale = VIEW_BASE / Math.max(dX, dY);
  const project: Projection = ([lng, lat]) => [
    PAD + (lng * COS_LAT0 - minX) * scale,
    PAD + (maxLat - lat) * scale,
  ];
  return { project, viewW: dX * scale + PAD * 2, viewH: dY * scale + PAD * 2 };
}

/** 도형 → SVG path d 문자열. */
export function geometryPath(geom: Geometry, project: Projection): string {
  return insetRings(geom)
    .map(
      (ring) =>
        ring
          .map((pt, i) => {
            const [x, y] = project(pt);
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join("") + "Z",
    )
    .join("");
}

/**
 * 화면에 투영된 링의 면적 중심. 좌표를 단순 평균하면 꼭짓점이 촘촘한 해안·경계 쪽으로
 * 이름표가 끌려가므로, 각 선분이 둘러싼 실제 면적을 가중치로 쓴다.
 */
function projectedRingCenter(
  ring: Position[],
  project: Projection,
): { x: number; y: number; area: number } {
  const points = ring.map(project);
  let twiceArea = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    weightedX += (x1 + x2) * cross;
    weightedY += (y1 + y2) * cross;
  }
  if (Math.abs(twiceArea) > 1e-6) {
    return {
      x: weightedX / (3 * twiceArea),
      y: weightedY / (3 * twiceArea),
      area: Math.abs(twiceArea) / 2,
    };
  }

  // 잘못 닫혔거나 일직선인 도형도 지도 전체를 깨뜨리지 않게 기존 평균을 폴백으로 둔다.
  const [sumX, sumY] = points.reduce(
    ([sx, sy], [x, y]) => [sx + x, sy + y],
    [0, 0],
  );
  return { x: sumX / points.length, y: sumY / points.length, area: 0 };
}

/** 실제 면적이 가장 큰 링(작은 섬 말고 본체)의 면적 중심. 이름표 자리를 잡는 데 쓴다. */
export function labelPoint(geom: Geometry, project: Projection): [number, number] {
  const centers = insetRings(geom).map((ring) => projectedRingCenter(ring, project));
  const best = centers.reduce((largest, center) =>
    center.area > largest.area ? center : largest,
  );
  return [best.x, best.y];
}
