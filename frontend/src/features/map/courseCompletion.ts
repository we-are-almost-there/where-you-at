import { haversineMeters, projectOntoSegment, type Direction } from "./courseProgress";
import { MAX_SPEED_MPS } from "./trackingRecord";
import type { LatLng } from "./types";

export interface CompletionPlan {
  key: string;
  points: LatLng[];
  /** 각 확인 지점까지의 코스 누적 거리(m). points와 나란히 대응한다(같은 인덱스끼리 짝). */
  pointDistances: number[];
  /** 표본으로 직접 방문을 확인해야 하는 반환점·교차 구간 내부 지점의 인덱스. */
  requiredVisits: number[];
  /** 방문 확인 후 귀환 구간으로 투영 범위를 전환할 반환점 인덱스. */
  turnarounds: number[];
  radius: number;
  /** 일반 확인 지점의 목표 간격(m). 반환점·교차 구간의 방문 지점은 별도로 끼워 넣는다. */
  spacing: number;
}

/** 시각이 있는 위치 표본. 이동 구간의 그럴듯한 속도를 판단하는 데 시각이 필요하다. */
export interface TimedLocation extends LatLng {
  timestamp: number;
}

export interface CompletionState {
  key: string;
  next: number;
  /** 마지막으로 관측한 코스 위 위치의 실제 투영 거리·시각. 통과 여부는 next로 관리한다. */
  progress?: { distanceM: number; timestamp: number };
}

/** GPX 점 밀도와 관계없이 최대 100m 간격으로 시작·중간·종점 확인 지점을 만든다. */
export function completionPlan(path: LatLng[], direction: Direction): CompletionPlan {
  const ordered = direction === "forward" ? path : [...path].reverse();
  const route = ordered.filter((point, i) => i === 0 || haversineMeters(ordered[i - 1], point) > 1e-6);
  // 이전 판정으로 저장한 통과 상태를 새 방문 확인 규칙에 그대로 재사용하지 않는다.
  const key = JSON.stringify(["completion-v2", direction, path]);
  const lengths = route.slice(1).map((point, i) => haversineMeters(route[i], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!Number.isFinite(total) || total <= 0) return { key, points: [], pointDistances: [], requiredVisits: [], turnarounds: [], radius: 0, spacing: 0 };
  const segments = Math.max(4, Math.ceil(total / 100));
  const spacing = total / segments;
  const points = [route[0]];
  const pointDistances = [0];
  let index = 0;
  let before = 0;
  for (let n = 1; n < segments; n++) {
    const target = spacing * n;
    while (index < lengths.length - 1 && before + lengths[index] < target) {
      before += lengths[index++];
    }
    const fraction = lengths[index] === 0 ? 0 : (target - before) / lengths[index];
    const a = route[index], b = route[index + 1];
    points.push({ lat: a.lat + (b.lat - a.lat) * fraction, lng: a.lng + (b.lng - a.lng) * fraction });
    pointDistances.push(target);
  }
  points.push(route[route.length - 1]);
  pointDistances.push(total);
  const turns: number[] = [];
  let routeDistance = 0;
  for (let i = 1; i < route.length - 1; i++) {
    routeDistance += lengths[i - 1];
    const cosLat = Math.cos(route[i].lat * Math.PI / 180);
    const ax = (route[i].lng - route[i - 1].lng) * cosLat;
    const ay = route[i].lat - route[i - 1].lat;
    const bx = (route[i + 1].lng - route[i].lng) * cosLat;
    const by = route[i + 1].lat - route[i].lat;
    // 120도 이상 방향을 바꾸는 꼭짓점은 직접 관측해야 한다. 직각 코너는 보간 가능하다.
    if (ax * bx + ay * by <= -0.5 * Math.hypot(ax, ay) * Math.hypot(bx, by)) turns.push(routeDistance);
  }
  // 교차점 자체는 두 차례의 방문을 구분하지 못한다. 두 교차 시점 사이 구간의
  // 중간 지점을 직접 방문해야 그 구간을 건너뛰고 미래 경로로 붙을 수 없다.
  const witnesses = crossingWitnesses(points, pointDistances, spacing);
  const visits = [...turns, ...witnesses].sort((a, b) => a - b)
    .filter((value, i, values) => i === 0 || value - values[i - 1] > 1e-6);
  for (const distance of visits) {
    if (pointDistances.some(value => Math.abs(value - distance) <= 1e-6)) continue;
    let segment = 0;
    let start = 0;
    while (segment < lengths.length - 1 && start + lengths[segment] < distance) start += lengths[segment++];
    const fraction = (distance - start) / lengths[segment];
    const a = route[segment], b = route[segment + 1];
    const at = pointDistances.findIndex(value => value > distance);
    pointDistances.splice(at, 0, distance);
    points.splice(at, 0, { lat: a.lat + (b.lat - a.lat) * fraction, lng: a.lng + (b.lng - a.lng) * fraction });
  }
  const requiredVisits = visits.map(distance => pointDistances.findIndex(value => Math.abs(value - distance) <= 1e-6));
  const turnarounds = turns.map(distance => pointDistances.findIndex(value => Math.abs(value - distance) <= 1e-6));
  return { key, points, pointDistances, requiredVisits, turnarounds, radius: Math.min(40, spacing / 3), spacing };
}

/** 약 100m 간격으로 줄인 경로에서 교차 전후를 구분할 방문 지점을 만든다. */
function crossingWitnesses(points: LatLng[], distances: number[], spacing: number): number[] {
  const witnesses: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    for (let j = i + 2; j < points.length; j++) {
      const c = points[j - 1], d = points[j];
      if (Math.max(a.lat, b.lat) < Math.min(c.lat, d.lat) || Math.min(a.lat, b.lat) > Math.max(c.lat, d.lat)
        || Math.max(a.lng, b.lng) < Math.min(c.lng, d.lng) || Math.min(a.lng, b.lng) > Math.max(c.lng, d.lng)) continue;
      const rx = b.lng - a.lng, ry = b.lat - a.lat;
      const sx = d.lng - c.lng, sy = d.lat - c.lat;
      const denominator = rx * sy - ry * sx;
      if (Math.abs(denominator) < 1e-15) continue; // 겹친 왕복 선분은 반환점으로 구분한다.
      const qx = c.lng - a.lng, qy = c.lat - a.lat;
      const t = (qx * sy - qy * sx) / denominator;
      const u = (qx * ry - qy * rx) / denominator;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const first = distances[i - 1] + t * (distances[i] - distances[i - 1]);
      const second = distances[j - 1] + u * (distances[j] - distances[j - 1]);
      if (second - first > spacing * 2) witnesses.push((first + second) / 2);
    }
  }
  return witnesses;
}

function checkpointRadius(plan: CompletionPlan, index: number): number {
  // 필수 방문점과 일반 지점이 거의 겹쳐도 필수 방문의 GPS 허용 오차가 사라지지 않게 한다.
  if (plan.requiredVisits.includes(index)) return plan.radius;
  const distance = plan.pointDistances[index];
  return Math.min(plan.radius,
    index > 0 ? (distance - plan.pointDistances[index - 1]) / 3 : Infinity,
    index + 1 < plan.points.length ? (plan.pointDistances[index + 1] - distance) / 3 : Infinity);
}

export function validCompletion(value: unknown, plan: CompletionPlan): value is CompletionState {
  if (!value || typeof value !== "object") return false;
  const state = value as CompletionState;
  if (state.key !== plan.key || !Number.isInteger(state.next) || state.next < 0 || state.next > plan.points.length) {
    return false;
  }
  if (state.progress !== undefined) {
    const { distanceM, timestamp } = state.progress;
    if (typeof distanceM !== "number" || typeof timestamp !== "number") return false;
  }
  return true;
}

/**
 * 위치를 확인 지점이 이루는 코스 위로 투영해, 시작부터의 누적 거리(m)와 코스까지의 수직 거리를
 * 구한다. 최단 수직 거리에서 GPS 오차 범위 안의 후보를 모은 뒤 진행 연속성을 비교한다.
 * 코스가 굽어 있어도 원시 좌표를 잇는 직선이 아니라 실제 코스 모양을 따라간다.
 */
function projectOntoPlan(plan: CompletionPlan, location: LatLng, referenceM: number, next: number): { distanceM: number; crossTrackM: number; ambiguous?: boolean } {
  const { points, pointDistances } = plan;
  if (points.length === 0) return { distanceM: 0, crossTrackM: Infinity };
  if (points.length === 1) return { distanceM: 0, crossTrackM: haversineMeters(points[0], location) };
  const candidates: { distanceM: number; crossTrackM: number }[] = [];
  let nearestM = Infinity;
  const legStart = plan.turnarounds.filter(index => index < next).at(-1) ?? 0;
  const legEnd = plan.turnarounds.find(index => index >= next) ?? points.length - 1;
  for (let i = 1; i < points.length; i++) {
    const foot = projectOntoSegment(location, points[i - 1], points[i]);
    const crossTrackM = haversineMeters(location, foot);
    // 확인 지점 사이의 직선 길이는 원래 곡선의 누적 거리보다 짧을 수 있다.
    // 선분 위 비율을 누적 거리 구간에 대응시켜 지점에 도착했는데도 덜 간 것으로 남지 않게 한다.
    const segmentLength = haversineMeters(points[i - 1], points[i]);
    const fraction = segmentLength > 0 ? Math.min(1, haversineMeters(points[i - 1], foot) / segmentLength) : 0;
    const distanceM = pointDistances[i - 1] + fraction * (pointDistances[i] - pointDistances[i - 1]);
    nearestM = Math.min(nearestM, crossTrackM);
    if (i > legStart && i <= legEnd) candidates.push({ distanceM, crossTrackM });
  }
  // courseProgress와 같은 5m를 상한으로 삼는다. 최단 거리를 먼저 확정해 후보 순서에
  // 따라 허용 범위가 넓어지지 않게 하고, 코스 반경 밖의 후보는 선택하지 않는다.
  const toleranceM = Math.min(5, plan.radius);
  const limitM = Math.min(plan.radius, nearestM + toleranceM);
  let best: (typeof candidates)[number] | undefined;
  for (const candidate of candidates) {
    if (candidate.crossTrackM > limitM) continue;
    // 전방을 우선하지 않는다. 실제 후퇴나 GPS 흔들림을 미래 구간으로 바꾸면 안 된다.
    if (!best || Math.abs(candidate.distanceM - referenceM) < Math.abs(best.distanceM - referenceM)) {
      best = candidate;
    }
  }
  if (!best) return { distanceM: 0, crossTrackM: nearestM, ambiguous: true };
  const bestGap = Math.abs(best.distanceM - referenceM);
  const ambiguous = candidates.some(candidate => candidate.crossTrackM <= limitM
    && Math.abs(candidate.distanceM - best.distanceM) > plan.spacing
    && Math.abs(Math.abs(candidate.distanceM - referenceM) - bestGap) <= toleranceM);
  return { ...best, ambiguous };
}

/**
 * 위치를 코스에 투영해 누적 진행 거리를 구한 뒤, 직전 진행 거리보다 앞으로 갔고(역주행이
 * 아니고) 그 구간의 평균 속도가 그럴듯하면(트래킹 기록 거리 계산과 같은 상한, trackingRecord.ts
 * 참고) 새로 지난 확인 지점을 한 번에 여러 개 인정한다 — GPS 표본이 성기거나 코스가 굽어 있어도,
 * 코스를 따라간 진행 거리를 기준으로 삼으므로 원시 좌표를 잇는 직선에 좌우되지 않는다.
 * 단, 반환점과 교차 구간 내부의 필수 방문점은 현재 표본이 반경 안에 있어야 통과한다.
 * 필수 방문점을 관측하지 못한 구간은 그럴듯한 속도만으로 소급 인정하지 않는다.
 *
 * 역주행이거나(진행 거리가 줄어듦) 속도가 물리적으로 말이 안 되면(순간 이동 의심), 이번 위치가
 * 다음 확인 지점 자체에 반경 이내로 붙어 있을 때만(직접 거리 검사) 그 지점 하나만 인정한다.
 * 이 예전 방식으로 되돌아가는 경우가, 같은 코스 구간 위에 있다는 이유만으로 통과 순서를
 * 확인하지 않고 여러 지점을 한꺼번에 소비하는 것을 막는다.
 *
 * segmentStart가 true면(일시정지 후 재개, 새로고침 후 자동 재개 등 추적하지 않은 구간의 경계)
 * 이전 진행 거리·시각을 이번 판정에 쓰지 않는다 — 추적하지 않은 이동으로 지점을 통과 처리하지
 * 않고, 이번 위치를 새 기준점으로만 삼는다.
 */
export function advanceCompletion(
  state: CompletionState | null,
  plan: CompletionPlan,
  location: TimedLocation,
  segmentStart = false,
): CompletionState {
  const current = validCompletion(state, plan) ? state : { key: plan.key, next: 0 };
  const referenceM = current.progress?.distanceM ?? plan.pointDistances[Math.max(0, current.next - 1)] ?? 0;
  const { distanceM, crossTrackM, ambiguous } = projectOntoPlan(plan, location, referenceM, current.next);
  // 이탈을 관측하면 이동 구간을 끊는다. 재진입 때 이탈 전 거리·시각을 연결하면
  // 코스 밖에서 보낸 시간으로 건너뛴 지점들을 소급 인정하게 된다.
  if (crossTrackM > plan.radius || ambiguous) return { key: plan.key, next: current.next };

  const previous = segmentStart ? undefined : current.progress;
  const covered = previous ? distanceM - previous.distanceM : 0;
  const elapsedSeconds = previous ? (location.timestamp - previous.timestamp) / 1000 : 0;
  const plausible = previous !== undefined && covered > 0 && elapsedSeconds > 0
    // 시작점이 미통과 지점보다 앞이면, 새 이동으로 건너뛴 지점까지 소급 인정하지 않는다.
    && previous.distanceM <= (plan.pointDistances[current.next] ?? Infinity) + 1e-6
    && covered / elapsedSeconds <= MAX_SPEED_MPS;

  if (!plausible) {
    const target = plan.points[current.next];
    const next = target && haversineMeters(target, location) <= checkpointRadius(plan, current.next) ? current.next + 1 : current.next;
    // 거리와 시각은 같은 관측값으로 보존한다. 거리를 클램핑하면 같은 위치에서 기다린
    // 시간만으로 가상의 이동이 생겨, 거부했던 구간이 나중에 정상 이동으로 인정된다.
    return { key: plan.key, next, progress: { distanceM, timestamp: location.timestamp } };
  }

  // pointDistances는 지점을 만들 때 나눗셈으로 미리 정한 값이고, distanceM은 좌표를 다시
  // 투영해 구한 값이라 같은 지점이라도 부동소수점 오차로 아주 미세하게 다를 수 있다.
  // 실제 GPS 오차(radius 단위)에 비하면 무의미한 차이라 아주 작은 허용치를 둔다.
  const EPSILON_M = 1e-6;
  let next = current.next;
  while (next < plan.points.length) {
    if (plan.requiredVisits.includes(next)) {
      // 반환점이나 교차 사이 구간은 시간이 충분해도 추측해서 통과시키지 않는다.
      if (haversineMeters(plan.points[next], location) > checkpointRadius(plan, next)) break;
    } else if (plan.pointDistances[next] > distanceM + EPSILON_M) break;
    next += 1;
  }
  return { key: plan.key, next, progress: { distanceM, timestamp: location.timestamp } };
}

export function hasCompleted(state: CompletionState | null, plan: CompletionPlan): boolean {
  return plan.points.length > 1 && validCompletion(state, plan) && state.next === plan.points.length;
}
