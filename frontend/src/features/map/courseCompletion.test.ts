import { expect, it } from "vitest";
import { advanceCompletion, completionPlan, hasCompleted, type CompletionState, type TimedLocation } from "./courseCompletion";
import type { LatLng } from "./types";

const line = [{ lat: 37, lng: 127 }, { lat: 37.01, lng: 127 }];

// 걷기 페이스(약 3m/s, 10.8km/h) 기준으로 이동 거리에 맞는 시각을 만든다.
// 표본 사이 실제로 걸릴 법한 시간을 줘야 advanceCompletion이 이동 구간을 그럴듯하다고 본다.
const PLAUSIBLE_MPS = 3;
let clock = 0;
function at(point: LatLng, metersFromPrevious = 0): TimedLocation {
  clock += (metersFromPrevious / PLAUSIBLE_MPS) * 1000;
  return { ...point, timestamp: clock };
}
// 표본 사이에 시간이 거의 안 흐른 것으로 찍는다 — 실제로 걸었다면 있을 수 없는 속도가 되어
// advanceCompletion이 이동 구간을 순간 이동(부정 통과 의심)으로 보고 이전 방식으로 되돌아간다.
function instantly(point: LatLng): TimedLocation {
  clock += 1;
  return { ...point, timestamp: clock };
}

it.each(["forward", "reverse"] as const)("%s 방향의 시작·중간·종점을 순서대로 지나야 완주한다", (direction) => {
  clock = 0;
  const plan = completionPlan(line, direction);
  let state: CompletionState | null = null;
  state = advanceCompletion(state, plan, at(plan.points.at(-1)!));
  expect(state.next).toBe(0);
  for (const point of plan.points.slice(0, -1)) state = advanceCompletion(state, plan, at(point, plan.spacing));
  expect(hasCompleted(state, plan)).toBe(false);
  const end = plan.points.at(-1)!;
  state = advanceCompletion(state, plan, at({ ...end, lng: end.lng + 0.002 }, plan.spacing));
  expect(hasCompleted(state, plan)).toBe(false);
  state = advanceCompletion(state, plan, at(end, plan.spacing));
  expect(hasCompleted(state, plan)).toBe(true);
});

it("출발 뒤 중간을 건너뛰거나 한 지점에 머물러도 완주하지 않는다", () => {
  clock = 0;
  const plan = completionPlan(line, "forward");
  let state = advanceCompletion(null, plan, at(plan.points[0]));
  // 시작점에서 종점으로 곧장 "순간 이동"한다 — 실제로 걸어서는 있을 수 없는 속도다.
  state = advanceCompletion(state, plan, instantly(plan.points.at(-1)!));
  for (let i = 0; i < 99; i++) state = advanceCompletion(state, plan, instantly(plan.points.at(-1)!));
  expect(state.next).toBe(1);
  expect(hasCompleted(state, plan)).toBe(false);
});

it("순환 코스도 출발점에 머물러서는 완주하지 않고 한 바퀴 따라야 한다", () => {
  clock = 0;
  const plan = completionPlan([...line, { lat: 37.01, lng: 127.01 }, line[0]], "forward");
  let state: CompletionState | null = null;
  for (let i = 0; i < 100; i++) state = advanceCompletion(state, plan, at(line[0]));
  expect(state!.next).toBe(1);
  for (const point of plan.points.slice(1)) state = advanceCompletion(state, plan, at(point, plan.spacing));
  expect(hasCompleted(state, plan)).toBe(true);
});

it("새로고침 후 이어가되 다른 방향·경로와 잘못된 저장값은 인정하지 않는다", () => {
  clock = 0;
  const plan = completionPlan(line, "forward");
  let state = advanceCompletion(null, plan, at(plan.points[0]));
  state = JSON.parse(JSON.stringify(state));
  for (const point of plan.points.slice(1)) state = advanceCompletion(state, plan, at(point, plan.spacing));
  expect(hasCompleted(state, plan)).toBe(true);
  expect(hasCompleted(state, completionPlan(line, "reverse"))).toBe(false);
  expect(hasCompleted({ key: plan.key, next: 999 }, plan)).toBe(false);
  expect(hasCompleted(state, completionPlan([], "forward"))).toBe(false);
  // 진행 거리·시각이 없거나 잘못된 값은 통째로 무효한 저장값으로 본다(예전 버전이 남긴 값 등).
  const legacyStoredValue = JSON.parse('{"key":' + JSON.stringify(plan.key) + ',"next":1,"progress":{"distanceM":"abc"}}');
  expect(hasCompleted(legacyStoredValue, plan)).toBe(false);
  expect(advanceCompletion(legacyStoredValue, plan, at(plan.points[0])).next).toBe(1);
});

it("GPS 오차 범위 안에서 확인 지점을 통과할 수 있다", () => {
  clock = 0;
  const plan = completionPlan(line, "forward");
  let state: CompletionState | null = null;
  for (const point of plan.points) state = advanceCompletion(state, plan, at({ ...point, lng: point.lng + 0.0001 }, plan.spacing));
  expect(hasCompleted(state, plan)).toBe(true);
});

function sampleAlongLine(plan: ReturnType<typeof completionPlan>, step: number): TimedLocation[] {
  const total = plan.spacing * (plan.points.length - 1);
  const start = plan.points[0], end = plan.points.at(-1)!;
  const samples: TimedLocation[] = [];
  for (let travelled = 0; travelled <= total; travelled += step) {
    const fraction = Math.min(1, travelled / total);
    const point = { lat: start.lat + (end.lat - start.lat) * fraction, lng: start.lng + (end.lng - start.lng) * fraction };
    samples.push(at(point, travelled === 0 ? 0 : step));
  }
  return samples;
}

it.each(["forward", "reverse"] as const)(
  "%s 방향에서 확인 지점 간격보다 성긴 GPS 표본으로도 완주한다",
  (direction) => {
    clock = 0;
    const plan = completionPlan(line, direction);
    // 확인 지점 간격(spacing)의 약 2배 간격으로만 표본을 넣어 중간 지점 여러 개를 건너뛴다.
    let state: CompletionState | null = null;
    for (const sample of sampleAlongLine(plan, plan.spacing * 2)) state = advanceCompletion(state, plan, sample);
    state = advanceCompletion(state, plan, at(plan.points.at(-1)!, plan.spacing));
    expect(hasCompleted(state, plan)).toBe(true);
  },
);

it.each(["forward", "reverse"] as const)(
  "%s 방향에서 지점 간격의 3배를 넘는 GPS 공백도 걸린 시간이 그럴듯하면 복구한다",
  (direction) => {
    clock = 0;
    const plan = completionPlan(line, direction);
    // 3×spacing 상한을 넘는 4배·10배 간격으로도, 걸린 시간이 그 거리에 맞는 걷기 속도라면
    // 특정 상한에 막혀 영구히 멈추지 않아야 한다.
    for (const multiplier of [4, 10]) {
      clock = 0;
      let state: CompletionState | null = null;
      for (const sample of sampleAlongLine(plan, plan.spacing * multiplier)) state = advanceCompletion(state, plan, sample);
      state = advanceCompletion(state, plan, at(plan.points.at(-1)!, plan.spacing));
      expect(hasCompleted(state, plan)).toBe(true);
    }
  },
);

it("일시정지 후 재개하면 정지 중 이동으로는 지점을 통과하지 못하고, 재개 뒤 정상 이동으로는 이어서 완주한다", () => {
  clock = 0;
  const plan = completionPlan(line, "forward");
  // 두 번째 확인 지점까지 정상적으로 이동한다.
  let state = advanceCompletion(null, plan, at(plan.points[0]));
  state = advanceCompletion(state, plan, at(plan.points[1], plan.spacing));
  expect(state.next).toBe(2);

  // 일시정지 상태로 다음 확인 지점을 지나 훨씬 앞까지 이동한 뒤 재개한다.
  // 정지 중 이동은 추적되지 않으므로, 재개 뒤 첫 표본은 segmentStart로 넘겨야 한다.
  const resumedAt = plan.points[5];
  const resumedState = advanceCompletion(state, plan, at(resumedAt, plan.spacing * 3), true);
  // segmentStart라 이전 위치와 구간을 잇지 않는다 — 정지 중 지나친 지점은 통과 처리되지 않는다.
  expect(resumedState.next).toBe(2);
  expect(hasCompleted(resumedState, plan)).toBe(false);

  // 대조: 같은 이동이라도 segmentStart를 안 넘기면(=끊기지 않은 정상 추적이라면) 앞으로 이동한
  // 것이므로 지나친 지점들이 정상적으로 한 번에 인정된다. (이후 서술과 무관한 갈래라 시계는 되돌린다.)
  const clockBeforeBranch = clock;
  const notSeveredState = advanceCompletion(state, plan, at(resumedAt, plan.spacing * 3), false);
  expect(notSeveredState.next).toBeGreaterThan(2);
  clock = clockBeforeBranch;

  // 재개 직후 곧장 더 앞으로 "순간 이동"하면(정지 중 이동과 마찬가지로 그럴듯하지 않은 속도라면)
  // 여전히 아무것도 인정되지 않는다 — segmentStart로 끊긴 기준점을 곧바로 다시 악용할 수 없다.
  const instantJump = advanceCompletion(resumedState, plan, instantly(plan.points.at(-1)!));
  expect(instantJump.next).toBe(2);
  clock = clockBeforeBranch;

  // 다만 재개 뒤 정상적으로 추적하며 놓친 지점 쪽으로 실제로 되돌아가면(예: 확인차 되돌아감),
  // 이번에 실제 도착한 지점(2) 하나만 인정된다 — 역주행 구간에 걸친 3·4·5까지 한꺼번에
  // 인정되지는 않는다(역주행 순서 검사). 이후 순서대로 다시 이동하면 이어서 완주할 수 있다.
  let recovered: CompletionState | null = advanceCompletion(resumedState, plan, at(plan.points[2], plan.spacing * 3));
  expect(recovered.next).toBe(3);
  for (const point of plan.points.slice(3)) recovered = advanceCompletion(recovered, plan, at(point, plan.spacing));
  expect(hasCompleted(recovered, plan)).toBe(true);
});

it.each(["forward", "reverse"] as const)(
  "%s 방향에서 앞선 지점으로 건너뛴 뒤 거슬러 오면 실제 도착한 지점 하나만 인정한다",
  (direction) => {
    clock = 0;
    const plan = completionPlan(line, direction);
    let state = advanceCompletion(null, plan, at(plan.points[0]));
    state = advanceCompletion(state, plan, at(plan.points[1], plan.spacing));
    expect(state.next).toBe(2);
    // 일시정지 후 재개해 앞선 지점(5)에서 다시 시작한다(segmentStart라 이전 위치와 안 잇는다).
    state = advanceCompletion(state, plan, at(plan.points[5], plan.spacing * 3), true);
    expect(state.next).toBe(2);
    // 실제로는 5 → 4 → 3 → 2 순서로 거슬러 왔다. 같은 코스 구간 위에 있다는 이유만으로
    // 3·4·5까지 한꺼번에 정방향 통과 처리되면 안 되고, 이번에 도착한 2 하나만 인정된다.
    state = advanceCompletion(state, plan, at(plan.points[2], plan.spacing * 3));
    expect(state.next).toBe(3);
  },
);

it.each(["forward", "reverse"] as const)(
  "%s 방향의 굽은 코스에서 코너를 건너뛴 성긴 GPS로도 완주한다",
  (direction) => {
    clock = 0;
    // 시작에서 100m 북상한 뒤 100m 동진하는 ㄱ자 코스. 코너는 표본으로 넣지 않는다.
    const start = { lat: 37, lng: 127 };
    const corner = { lat: 37 + 100 / 111_320, lng: 127 };
    const end = { lat: corner.lat, lng: corner.lng + 100 / (111_320 * Math.cos((corner.lat * Math.PI) / 180)) };
    const plan = completionPlan([start, corner, end], direction);
    const routeStart = plan.points[0], routeEnd = plan.points.at(-1)!;
    let state: CompletionState | null = advanceCompletion(null, plan, at(routeStart));
    // 코너를 건너뛰고 종점만 표본으로 넣는다. 실제 이동 거리(코너를 도는 약 200m)에 맞는 시간을 준다.
    state = advanceCompletion(state, plan, at(routeEnd, 200));
    expect(hasCompleted(state, plan)).toBe(true);
  },
);
