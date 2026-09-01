import type { LatLng } from "./types";

// 인접 좌표가 이 거리(km)를 넘으면 끊긴 구간(국토종주 자전거길의 지선 pen-up)으로 보고
// 하나의 선으로 잇지 않는다. 백엔드 collect_bike_routes.py의 _MAX_GAP_KM(거리 합산 제외 기준)과
// 동일한 값 — 거리 계산에선 이미 제외되던 gap이 렌더에선 직선으로 이어지던 문제를 맞춘다.
const GAP_SPLIT_KM = 3;

// 간략화된 좌표(목록 응답의 path_trail·path_bicycle)는 코스당 40점으로 솎아내므로 점 간격이
// km 단위다. 232km 코스면 평균 5.8km라 3km 고정 기준으로는 정상 구간이 전부 gap으로 오인돼
// 코스가 조각조각 끊긴다. 진짜 pen-up gap은 '그 경로의 평소 간격'에 비해 튀는 값이므로,
// 중앙값의 배수도 함께 기준으로 삼아 둘 중 큰 쪽을 쓴다.
// (원본 GPX는 간격이 수십 m라 중앙값 기준이 3km를 넘지 않아 기존 동작 그대로다.)
const GAP_MEDIAN_MULTIPLE = 4;

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * 좌표 배열을 gap(끊긴 구간)에서 잘라 연속 세그먼트들로 나눈다.
 * 지도 폴리라인·카드 썸네일이 끊긴 구간을 직선으로 잇지 않도록 세그먼트별로 그리기 위함.
 * gap이 없는 코스(두루누비 도보·OSRM 자전거)는 세그먼트 1개 그대로라 동작이 바뀌지 않는다.
 */
export function splitIntoSegments(pts: LatLng[]): LatLng[][] {
  if (pts.length === 0) return [];

  const gaps: number[] = [];
  for (let i = 1; i < pts.length; i++) gaps.push(haversineKm(pts[i - 1], pts[i]));
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
  const threshold = Math.max(GAP_SPLIT_KM, median * GAP_MEDIAN_MULTIPLE);

  const segments: LatLng[][] = [[pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    if (gaps[i - 1] > threshold) segments.push([]);
    segments[segments.length - 1].push(pts[i]);
  }
  return segments;
}
