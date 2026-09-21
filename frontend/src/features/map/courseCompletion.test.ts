import { expect, it } from "vitest";
import { advanceCompletion, completionPlan, hasCompleted, type CompletionState } from "./courseCompletion";

const line = [{ lat: 37, lng: 127 }, { lat: 37.01, lng: 127 }];

it.each(["forward", "reverse"] as const)("%s 방향의 시작·중간·종점을 순서대로 지나야 완주한다", (direction) => {
  const plan = completionPlan(line, direction);
  let state: CompletionState | null = null;
  state = advanceCompletion(state, plan, plan.points.at(-1)!);
  expect(state.next).toBe(0);
  for (const point of plan.points.slice(0, -1)) state = advanceCompletion(state, plan, point);
  expect(hasCompleted(state, plan)).toBe(false);
  const end = plan.points.at(-1)!;
  state = advanceCompletion(state, plan, { ...end, lng: end.lng + 0.002 });
  expect(hasCompleted(state, plan)).toBe(false);
  state = advanceCompletion(state, plan, end);
  expect(hasCompleted(state, plan)).toBe(true);
});

it("출발 뒤 중간을 건너뛰거나 한 지점에 머물러도 완주하지 않는다", () => {
  const plan = completionPlan(line, "forward");
  let state = advanceCompletion(null, plan, plan.points[0]);
  for (let i = 0; i < 100; i++) state = advanceCompletion(state, plan, plan.points.at(-1)!);
  expect(state.next).toBe(1);
  expect(hasCompleted(state, plan)).toBe(false);
});

it("순환 코스도 출발점에 머물러서는 완주하지 않고 한 바퀴 따라야 한다", () => {
  const plan = completionPlan([...line, { lat: 37.01, lng: 127.01 }, line[0]], "forward");
  let state: CompletionState | null = null;
  for (let i = 0; i < 100; i++) state = advanceCompletion(state, plan, line[0]);
  expect(state!.next).toBe(1);
  for (const point of plan.points.slice(1)) state = advanceCompletion(state, plan, point);
  expect(hasCompleted(state, plan)).toBe(true);
});

it("새로고침 후 이어가되 다른 방향·경로와 잘못된 저장값은 인정하지 않는다", () => {
  const plan = completionPlan(line, "forward");
  let state = advanceCompletion(null, plan, plan.points[0]);
  state = JSON.parse(JSON.stringify(state));
  for (const point of plan.points.slice(1)) state = advanceCompletion(state, plan, point);
  expect(hasCompleted(state, plan)).toBe(true);
  expect(hasCompleted(state, completionPlan(line, "reverse"))).toBe(false);
  expect(hasCompleted({ key: plan.key, next: 999 }, plan)).toBe(false);
  expect(hasCompleted(state, completionPlan([], "forward"))).toBe(false);
});

it("GPS 오차 범위 안에서 확인 지점을 통과할 수 있다", () => {
  const plan = completionPlan(line, "forward");
  let state: CompletionState | null = null;
  for (const point of plan.points) state = advanceCompletion(state, plan, { ...point, lng: point.lng + 0.0001 });
  expect(hasCompleted(state, plan)).toBe(true);
});
