import { haversineMeters, projectOntoSegment, type Direction } from "./courseProgress";
import type { LatLng } from "./types";

export interface CompletionPlan {
  key: string;
  points: LatLng[];
  radius: number;
  /** 확인 지점 사이의 목표 간격(m). 표본 사이 이동 구간을 인정할지 판단하는 상한 계산에 쓴다. */
  spacing: number;
}
export interface CompletionState {
  key: string;
  next: number;
  /** 마지막으로 인정된 원시 위치. 다음 호출에서 이동 구간을 만드는 데 쓴다. 이전 저장값엔 없을 수 있다. */
  location?: LatLng;
}

// 이 배수보다 먼 이동은 순간 이동(부정 통과)으로 보고 구간 판정을 쓰지 않는다.
const MAX_GAP_SPACING_MULTIPLIER = 3;

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
    const { lat, lng } = state.location;
    if (typeof lat !== "number" || typeof lng !== "number") return false;
  }
  return true;
}

/**
 * 다음 확인 지점들을 순서대로 검사한다. 직전에 인정된 위치와 이번 위치를 잇는 이동 구간이 확인
 * 지점에 반경 이내로 붙어 있으면 통과로 인정한다 — GPS 표본이 성겨 지점 사이를 건너뛰어도,
 * 순서대로 지난 지점 여러 개를 한 번에 인정할 수 있다.
 * 이동 구간이 지점 간격의 몇 배를 넘으면(순간 이동 의심) 다음 지점 하나만 이번 위치로 직접
 * 검사하는 예전 방식으로 되돌아가, 시작점에서 종점으로 곧장 건너뛰는 부정 통과를 막는다.
 */
export function advanceCompletion(state: CompletionState | null, plan: CompletionPlan, location: LatLng): CompletionState {
  const current = validCompletion(state, plan) ? state : { key: plan.key, next: 0 };
  const from = current.location;
  const maxGap = plan.spacing * MAX_GAP_SPACING_MULTIPLIER;
  const useSegment = from !== undefined && haversineMeters(from, location) <= maxGap;

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
