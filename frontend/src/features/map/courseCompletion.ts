import { haversineMeters, projectOntoSegment, type Direction } from "./courseProgress";
import { MAX_SPEED_MPS } from "./trackingRecord";
import type { LatLng } from "./types";

export interface CompletionPlan {
  key: string;
  points: LatLng[];
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
  /** 마지막으로 인정된 원시 위치·시각. 다음 호출에서 이동 구간을 만드는 데 쓴다. 이전 저장값엔 없을 수 있다. */
  location?: TimedLocation;
}

/** GPX 점 밀도와 관계없이 최대 100m 간격으로 시작·중간·종점 확인 지점을 만든다. */
export function completionPlan(path: LatLng[], direction: Direction): CompletionPlan {
  const route = direction === "forward" ? path : [...path].reverse();
  const key = JSON.stringify([direction, path]);
  const lengths = route.slice(1).map((point, i) => haversineMeters(route[i], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!Number.isFinite(total) || total <= 0) return { key, points: [], radius: 0, spacing: 0 };
  const segments = Math.max(4, Math.ceil(total / 100));
  const spacing = total / segments;
  const points = [route[0]];
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
  }
  points.push(route[route.length - 1]);
  // 인접 확인 지점의 허용 범위가 겹쳐 가만히 있어도 통과하지 않도록 제한한다.
  return { key, points, radius: Math.min(40, spacing / 3), spacing };
}

export function validCompletion(value: unknown, plan: CompletionPlan): value is CompletionState {
  if (!value || typeof value !== "object") return false;
  const state = value as CompletionState;
  if (state.key !== plan.key || !Number.isInteger(state.next) || state.next < 0 || state.next > plan.points.length) {
    return false;
  }
  if (state.location !== undefined) {
    const { lat, lng, timestamp } = state.location;
    if (typeof lat !== "number" || typeof lng !== "number" || typeof timestamp !== "number") return false;
  }
  return true;
}

/**
 * 다음 확인 지점들을 순서대로 검사한다. 직전에 인정된 위치·시각과 이번 위치·시각을 잇는 이동
 * 구간의 평균 속도가 그럴듯하면(트래킹 기록 거리 계산과 같은 상한, trackingRecord.ts 참고)
 * 그 구간이 확인 지점에 반경 이내로 붙어 있는지로 통과 여부를 본다 — GPS 표본이 아무리 성겨도,
 * 실제로 이동한 것이라면(구간이 길어도 걸린 시간에 비해 속도가 그럴듯하면) 순서대로 지난
 * 지점 여러 개를 한 번에 인정한다. 속도가 물리적으로 말이 안 되면(순간 이동 의심) 다음 지점
 * 하나만 이번 위치로 직접 검사하는 예전 방식으로 되돌아가, 시작점에서 종점으로 곧장 건너뛰는
 * 부정 통과를 막는다.
 *
 * segmentStart가 true면(일시정지 후 재개, 새로고침 후 자동 재개 등 추적하지 않은 구간의 경계)
 * 이전 위치·시각을 이번 판정에 쓰지 않는다 — 추적하지 않은 이동으로 지점을 통과 처리하지 않고,
 * 이번 위치를 새 기준점으로만 삼는다.
 */
export function advanceCompletion(
  state: CompletionState | null,
  plan: CompletionPlan,
  location: TimedLocation,
  segmentStart = false,
): CompletionState {
  const current = validCompletion(state, plan) ? state : { key: plan.key, next: 0 };
  const from = segmentStart ? undefined : current.location;
  const elapsedSeconds = from ? (location.timestamp - from.timestamp) / 1000 : 0;
  const useSegment = from !== undefined && elapsedSeconds > 0
    && haversineMeters(from, location) / elapsedSeconds <= MAX_SPEED_MPS;

  let next = current.next;
  while (next < plan.points.length) {
    const target = plan.points[next];
    const distance = useSegment
      ? haversineMeters(target, projectOntoSegment(target, from!, location))
      : haversineMeters(target, location);
    if (distance > plan.radius) break;
    next += 1;
    if (!useSegment) break;
  }
  return { key: plan.key, next, location };
}

export function hasCompleted(state: CompletionState | null, plan: CompletionPlan): boolean {
  return plan.points.length > 1 && validCompletion(state, plan) && state.next === plan.points.length;
}
