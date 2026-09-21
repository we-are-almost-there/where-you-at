import { haversineMeters, type Direction } from "./courseProgress";
import type { LatLng } from "./types";

export interface CompletionPlan {
  key: string;
  points: LatLng[];
  radius: number;
}
export interface CompletionState { key: string; next: number }

/** GPX 점 밀도와 관계없이 최대 100m 간격으로 시작·중간·종점 확인 지점을 만든다. */
export function completionPlan(path: LatLng[], direction: Direction): CompletionPlan {
  const route = direction === "forward" ? path : [...path].reverse();
  const key = JSON.stringify([direction, path]);
  const lengths = route.slice(1).map((point, i) => haversineMeters(route[i], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!Number.isFinite(total) || total <= 0) return { key, points: [], radius: 0 };
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
  return { key, points, radius: Math.min(40, spacing / 3) };
}

export function validCompletion(value: unknown, plan: CompletionPlan): value is CompletionState {
  if (!value || typeof value !== "object") return false;
  const state = value as CompletionState;
  return state.key === plan.key && Number.isInteger(state.next) && state.next >= 0 && state.next <= plan.points.length;
}

/** 다음 확인 지점 하나만 인정한다. 종점으로 건너뛰거나 경로 밖에 있으면 진행하지 않는다. */
export function advanceCompletion(state: CompletionState | null, plan: CompletionPlan, location: LatLng): CompletionState {
  const current = validCompletion(state, plan) ? state : { key: plan.key, next: 0 };
  const target = plan.points[current.next];
  return target && haversineMeters(location, target) <= plan.radius
    ? { key: plan.key, next: current.next + 1 } : current;
}

export function hasCompleted(state: CompletionState | null, plan: CompletionPlan): boolean {
  return plan.points.length > 1 && validCompletion(state, plan) && state.next === plan.points.length;
}
