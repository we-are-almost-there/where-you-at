import type { LatLng } from "./types";

// 코스 진행 방향. UI에서 결정(기본 정방향, 토글로 역방향)해 넘겨준다.
// forward: waypoints[0]=0% → waypoints[last]=100%
// reverse: waypoints[last]=0% → waypoints[0]=100%
export type Direction = "forward" | "reverse";

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// 두 좌표 사이의 거리(m). 하버사인.
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// 각 waypoint까지의 누적거리(m). cum[0] = 0, cum[last] = 전체 거리.
function cumulativeMeters(waypoints: LatLng[]): number[] {
  const cum = new Array<number>(waypoints.length);
  cum[0] = 0;
  for (let i = 1; i < waypoints.length; i++) {
    cum[i] = cum[i - 1] + haversineMeters(waypoints[i - 1], waypoints[i]);
  }
  return cum;
}

// 현재 위치와 가장 가까운 waypoint의 인덱스.
// 같은 좌표가 여러 번 나오면 진행 방향의 시작점부터 탐색해 출발 시 0%를 우선한다.
function nearestIndex(waypoints: LatLng[], location: LatLng, direction: Direction): number {
  let best = direction === "forward" ? 0 : waypoints.length - 1;
  let bestDist = Infinity;
  const start = direction === "forward" ? 0 : waypoints.length - 1;
  const end = direction === "forward" ? waypoints.length : -1;
  const step = direction === "forward" ? 1 : -1;
  for (let i = start; i !== end; i += step) {
    const d = haversineMeters(waypoints[i], location);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function clampPercent(v: number): number {
  return Math.min(100, Math.max(0, v));
}

function progressAtIndex(cum: number[], total: number, index: number, direction: Direction): number {
  const forwardPct = (cum[index] / total) * 100;
  return clampPercent(direction === "forward" ? forwardPct : 100 - forwardPct);
}

// 순환·교차 코스처럼 현재 위치 근처에 waypoint가 여러 개면 직전 진행률과 가장 가까운
// 후보를 선택한다. 위치 오차 범위 안에서는 공간 거리보다 이동 연속성이 더 믿을 만하다.
const CONTINUITY_TOLERANCE_M = 5;

function nearestContinuousIndex(
  waypoints: LatLng[],
  location: LatLng,
  direction: Direction,
  cum: number[],
  total: number,
  previous: number,
): number {
  const distances: number[] = [];
  let nearestDistance = Infinity;
  for (const point of waypoints) {
    const distance = haversineMeters(point, location);
    distances.push(distance);
    if (distance < nearestDistance) nearestDistance = distance;
  }
  let best =
    direction === "forward" ? distances.indexOf(nearestDistance) : distances.lastIndexOf(nearestDistance);
  let bestGap = Math.abs(progressAtIndex(cum, total, best, direction) - previous);

  for (let i = 0; i < waypoints.length; i++) {
    if (distances[i] > nearestDistance + CONTINUITY_TOLERANCE_M) continue;
    const gap = Math.abs(progressAtIndex(cum, total, i, direction) - previous);
    if (gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * 현재 위치의 원시 진행률(0~100).
 * 가장 가까운 GPX 지점의 누적거리 / 전체 거리로 환산하고, direction에 따라 뒤집는다.
 * - waypoints가 2개 미만이거나 전체 거리가 0이면 0.
 * - 경로에서 벗어난 위치도 "가장 가까운 지점" 기준으로 환산하므로 항상 0~100.
 */
export function rawProgress(waypoints: LatLng[], location: LatLng, direction: Direction): number {
  if (waypoints.length < 2) return 0;
  const cum = cumulativeMeters(waypoints);
  const total = cum[cum.length - 1];
  if (total === 0) return 0;

  return progressAtIndex(cum, total, nearestIndex(waypoints, location, direction), direction);
}

// 현재 위치를 선분 [a,b] 위로 정사영한 점. 짧은 거리라 경도만 위도 수렴(cos)으로 보정한
// 평면 근사로 t를 구한 뒤, 그 t로 실제 좌표를 선형보간한다. t는 [0,1]로 잘라 선분 밖은 끝점에 붙인다.
export function projectOntoSegment(location: LatLng, a: LatLng, b: LatLng): LatLng {
  const cosLat = Math.cos(toRad((a.lat + b.lat) / 2));
  const ax = a.lng * cosLat;
  const bx = b.lng * cosLat;
  const px = location.lng * cosLat;
  const dx = bx - ax;
  const dy = b.lat - a.lat;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a; // a와 b가 같은 점
  let t = ((px - ax) * dx + (location.lat - a.lat) * dy) / len2;
  t = Math.min(1, Math.max(0, t));
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/**
 * 현재 위치에서 코스까지의 가장 가까운 점과 그 거리(m).
 * 꼭짓점이 아니라 각 선분에 내린 수선(cross-track) 기준이라 GPX 점 간격에 덜 흔들린다.
 * 지점이 없으면 point=null, distance=Infinity(= 판정 불가).
 */
export function nearestPointOnCourse(
  waypoints: LatLng[],
  location: LatLng,
): { point: LatLng | null; distance: number } {
  if (waypoints.length === 0) return { point: null, distance: Infinity };
  if (waypoints.length === 1) return { point: waypoints[0], distance: haversineMeters(waypoints[0], location) };

  let bestPoint = waypoints[0];
  let bestDist = Infinity;
  for (let i = 1; i < waypoints.length; i++) {
    const foot = projectOntoSegment(location, waypoints[i - 1], waypoints[i]);
    const d = haversineMeters(location, foot);
    if (d < bestDist) {
      bestDist = d;
      bestPoint = foot;
    }
  }
  return { point: bestPoint, distance: bestDist };
}

/**
 * 현재 위치에서 코스까지의 거리(m). 지점이 없으면 Infinity(= 판정 불가)를 돌려준다.
 */
export function distanceToCourse(waypoints: LatLng[], location: LatLng): number {
  return nearestPointOnCourse(waypoints, location).distance;
}

/**
 * 최고 진행률 유지: 직전 진행률을 하한으로 삼아 감소하지 않는 진행률(0~100)을 반환.
 * GPS 튐·역행으로 rawProgress가 낮아져도 previous 아래로는 내려가지 않는다.
 * (방향을 바꾸거나 추적을 종료할 때는 호출부에서 previous를 0으로 초기화한다.)
 */
export function advanceProgress(
  previous: number,
  waypoints: LatLng[],
  location: LatLng,
  direction: Direction,
): number {
  if (waypoints.length < 2) return previous;
  const cum = cumulativeMeters(waypoints);
  const total = cum[cum.length - 1];
  if (total === 0) return previous;

  const index = nearestContinuousIndex(waypoints, location, direction, cum, total, previous);
  return Math.max(previous, progressAtIndex(cum, total, index, direction));
}
