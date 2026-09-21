import { haversineMeters, projectOntoSegment, type Direction } from "./courseProgress";
import { MAX_SPEED_MPS } from "./trackingRecord";
import type { LatLng } from "./types";

export interface CompletionPlan {
  key: string;
  points: LatLng[];
  /** 각 확인 지점까지의 코스 누적 거리(m). points와 나란히 대응한다(같은 인덱스끼리 짝). */
  pointDistances: number[];
  radius: number;
  /** 확인 지점 사이의 목표 간격(m). 지금은 판정에 안 쓰지만 코스 성격을 나타내는 값이라 남겨 둔다. */
  spacing: number;
}

/** 시각이 있는 위치 표본. 이동 구간의 그럴듯한 속도를 판단하는 데 시각이 필요하다. */
export interface TimedLocation extends LatLng {
  timestamp: number;
}

export interface CompletionState {
  key: string;
  next: number;
  /** 마지막으로 인정된 위치의 코스 누적 진행 거리·시각. 이전 저장값엔 없을 수 있다. */
  progress?: { distanceM: number; timestamp: number };
}

/** GPX 점 밀도와 관계없이 최대 100m 간격으로 시작·중간·종점 확인 지점을 만든다. */
export function completionPlan(path: LatLng[], direction: Direction): CompletionPlan {
  const route = direction === "forward" ? path : [...path].reverse();
  const key = JSON.stringify([direction, path]);
  const lengths = route.slice(1).map((point, i) => haversineMeters(route[i], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!Number.isFinite(total) || total <= 0) return { key, points: [], pointDistances: [], radius: 0, spacing: 0 };
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
  // 인접 확인 지점의 허용 범위가 겹쳐 가만히 있어도 통과하지 않도록 제한한다.
  return { key, points, pointDistances, radius: Math.min(40, spacing / 3), spacing };
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
 * 구한다. 각 구간(확인 지점 사이)에 내린 수선 중 가장 가까운 것을 쓰므로 코스가 굽어 있어도
 * 원시 좌표를 잇는 직선이 아니라 실제 코스 모양을 따라간다.
 */
function projectOntoPlan(plan: CompletionPlan, location: LatLng): { distanceM: number; crossTrackM: number } {
  const { points, pointDistances } = plan;
  if (points.length === 0) return { distanceM: 0, crossTrackM: Infinity };
  if (points.length === 1) return { distanceM: 0, crossTrackM: haversineMeters(points[0], location) };
  let bestDistanceM = 0;
  let bestCrossTrackM = Infinity;
  for (let i = 1; i < points.length; i++) {
    const foot = projectOntoSegment(location, points[i - 1], points[i]);
    const crossTrackM = haversineMeters(location, foot);
    if (crossTrackM < bestCrossTrackM) {
      bestCrossTrackM = crossTrackM;
      bestDistanceM = pointDistances[i - 1] + haversineMeters(points[i - 1], foot);
    }
  }
  return { distanceM: bestDistanceM, crossTrackM: bestCrossTrackM };
}

/**
 * 위치를 코스에 투영해 누적 진행 거리를 구한 뒤, 직전 진행 거리보다 앞으로 갔고(역주행이
 * 아니고) 그 구간의 평균 속도가 그럴듯하면(트래킹 기록 거리 계산과 같은 상한, trackingRecord.ts
 * 참고) 새로 지난 확인 지점을 한 번에 여러 개 인정한다 — GPS 표본이 성기거나 코스가 굽어 있어도,
 * 코스를 따라간 실제 진행 거리를 기준으로 삼으므로 원시 좌표를 잇는 직선에 좌우되지 않는다.
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
  const { distanceM, crossTrackM } = projectOntoPlan(plan, location);
  // 코스에서 너무 멀면 진행 기준점을 옮기지 않는다 — 벗어난 위치의 투영값은 믿을 수 없다.
  if (crossTrackM > plan.radius) return { key: plan.key, next: current.next, progress: current.progress };

  const previous = segmentStart ? undefined : current.progress;
  const covered = previous ? distanceM - previous.distanceM : 0;
  const elapsedSeconds = previous ? (location.timestamp - previous.timestamp) / 1000 : 0;
  const plausible = previous !== undefined && covered > 0 && elapsedSeconds > 0
    && covered / elapsedSeconds <= MAX_SPEED_MPS;

  if (!plausible) {
    const target = plan.points[current.next];
    const next = target && haversineMeters(target, location) <= plan.radius ? current.next + 1 : current.next;
    // 이번 위치를 그대로 다음 기준점으로 믿으면 안 된다 — segmentStart나 순간 이동 의심으로
    // next를 안 올렸다면, 진행 거리가 아직 필요한 지점보다 앞서 있어도 그 지점 위치로 눌러
    // 담아 둔다. 안 그러면 다음 호출이 이 앞선 위치를 정상 구간의 시작점으로 여겨, 건너뛴
    // 지점들을 그럴듯한 속도라는 이유만으로 한꺼번에 인정해 버린다.
    const boundDistanceM = next < plan.pointDistances.length ? Math.min(distanceM, plan.pointDistances[next]) : distanceM;
    return { key: plan.key, next, progress: { distanceM: boundDistanceM, timestamp: location.timestamp } };
  }

  // pointDistances는 지점을 만들 때 나눗셈으로 미리 정한 값이고, distanceM은 좌표를 다시
  // 투영해 구한 값이라 같은 지점이라도 부동소수점 오차로 아주 미세하게 다를 수 있다.
  // 실제 GPS 오차(radius 단위)에 비하면 무의미한 차이라 아주 작은 허용치를 둔다.
  const EPSILON_M = 1e-6;
  let next = current.next;
  while (next < plan.points.length && plan.pointDistances[next] <= distanceM + EPSILON_M) next += 1;
  return { key: plan.key, next, progress: { distanceM, timestamp: location.timestamp } };
}

export function hasCompleted(state: CompletionState | null, plan: CompletionPlan): boolean {
  return plan.points.length > 1 && validCompletion(state, plan) && state.next === plan.points.length;
}
