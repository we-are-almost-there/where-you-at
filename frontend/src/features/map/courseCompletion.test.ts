import { expect, it } from "vitest";
import { advanceCompletion, completionPlan, hasCompleted, type CompletionState, type TimedLocation } from "./courseCompletion";
import type { LatLng } from "./types";
import { haversineMeters } from "./courseProgress";

const line = [{ lat: 37, lng: 127 }, { lat: 37.01, lng: 127 }];

function smoothReturnPath(arcSamples: number): LatLng[] {
  const xy = (x: number, y: number): LatLng => ({
    lat: 37 + y / 111_320,
    lng: 127 + x / (111_320 * Math.cos(37 * Math.PI / 180)),
  });
  const path = [xy(0, 0)];
  for (let y = 50; y <= 1000; y += 50) path.push(xy(0, y));
  for (let i = 1; i <= arcSamples; i++) {
    const angle = Math.PI - i * Math.PI / arcSamples;
    path.push(xy(2 + 2 * Math.cos(angle), 1000 + 2 * Math.sin(angle)));
  }
  for (let y = 950; y >= 0; y -= 50) path.push(xy(4, y));
  return path;
}

it.each(["forward", "reverse"] as const)("%s 완만한 U자 반환도 좌표 밀도와 관계없이 정상 귀환을 인정한다", (direction) => {
  for (const arcSamples of [6, 18, 60]) {
    const path = smoothReturnPath(arcSamples);
    const plan = completionPlan(path, direction);
    expect(plan.turnarounds.length).toBe(1);
    const samples = direction === "forward" ? path : [...path].reverse();
    let state: CompletionState | null = null;
    let timestamp = 0;
    for (let i = 0; i < samples.length; i++) {
      if (i > 0) timestamp += haversineMeters(samples[i - 1], samples[i]) / 3 * 1000;
      state = advanceCompletion(state, plan, { ...samples[i], timestamp });
    }
    expect(hasCompleted(state, plan)).toBe(true);
  }
});

it.each(["forward", "reverse"] as const)("%s 완만한 U자 코스도 반환 전 귀환 길로 옮기면 완주하지 않는다", (direction) => {
  const path = smoothReturnPath(18);
  const plan = completionPlan(path, direction);
  const samples = direction === "forward" ? path : [...path].reverse();
  let state = advanceCompletion(null, plan, { ...samples[0], timestamp: 0 });
  state = advanceCompletion(state, plan, { ...samples[10], timestamp: 200_000 });
  state = advanceCompletion(state, plan, { ...samples.at(-1)!, timestamp: 400_000 });
  state = advanceCompletion(state, plan, { ...samples.at(-1)!, timestamp: 4_000_000 });
  expect(hasCompleted(state, plan)).toBe(false);
  expect(state.next).toBeLessThanOrEqual(plan.turnarounds[0]);
});

it.each(["forward", "reverse"] as const)("%s 코스 이탈 후 앞선 지점이나 종점에 재진입해도 누락 구간은 인정하지 않는다", (direction) => {
  const plan = completionPlan(line, direction);
  for (const reentry of [plan.points[6], plan.points.at(-1)!]) {
    let state = advanceCompletion(null, plan, { ...plan.points[0], timestamp: 0 });
    state = advanceCompletion(state, plan, { lat: 37.005, lng: 127.01, timestamp: 120_000 });
    expect(state.next).toBe(1);
    expect(state.progress).toBeUndefined();
    // 저장·복원 뒤에도 이탈 전 이동 구간을 이어 붙이지 않는다.
    state = advanceCompletion(JSON.parse(JSON.stringify(state)), plan, { ...reentry, timestamp: 400_000 });
    state = advanceCompletion(state, plan, { ...plan.points.at(-1)!, timestamp: 800_000 });
    expect(state.next).toBe(1);
    expect(hasCompleted(state, plan)).toBe(false);
    state = advanceCompletion(state, plan, { ...plan.points[1], timestamp: 1_200_000 });
    for (let i = 2; i < plan.points.length; i++) {
      state = advanceCompletion(state, plan, { ...plan.points[i], timestamp: 1_200_000 + i * 60_000 });
    }
    expect(hasCompleted(state, plan)).toBe(true);
  }
});

it.each(["forward", "reverse"] as const)("%s 교차점의 수m GPS 오차로 미래 구간을 선택하지 않는다", (direction) => {
  const xy = (x: number, y: number): LatLng => ({
    lat: 37 + y / 111_320,
    lng: 127 + x / (111_320 * Math.cos(37 * Math.PI / 180)),
  });
  const path = [xy(-200, -200), xy(200, 200), xy(-200, 200), xy(200, -200)];
  const plan = completionPlan(path, direction);
  let state = advanceCompletion(null, plan, { ...plan.points[0], timestamp: 0 });
  state = advanceCompletion(state, plan, { ...plan.points[1], timestamp: 40_000 });
  expect(state.next).toBe(2);
  const crossing = direction === "forward" ? xy(-2.2, 0.9) : xy(2.2, 0.9);
  state = advanceCompletion(state, plan, { ...crossing, timestamp: 120_000 });
  expect(state.progress!.distanceM).toBeGreaterThan(250);
  expect(state.progress!.distanceM).toBeLessThan(310);
  expect(state.next).toBeLessThanOrEqual(4);
  // 교차점에서 약간 뒤로 흔들려도 전방의 먼 구간으로 점프하지 않는다.
  state = advanceCompletion(state, plan, { ...xy(0, 0), timestamp: 130_000 });
  state = advanceCompletion(state, plan, { ...crossing, timestamp: 240_000 });
  expect(state.progress!.distanceM).toBeLessThan(310);
  expect(state.next).toBeLessThanOrEqual(4);
  for (let i = state.next; i < plan.points.length; i++) {
    state = advanceCompletion(state, plan, { ...plan.points[i], timestamp: 240_000 + i * 60_000 });
  }
  expect(hasCompleted(state, plan)).toBe(true);
});

it.each([false, true])("순간이동 또는 재개 뒤 종점에서 기다려도 완주되지 않는다 (재개: %s)", (segmentStart) => {
  const plan = completionPlan(line, "forward");
  let state = advanceCompletion(null, plan, { ...line[0], timestamp: 0 });
  state = advanceCompletion(state, plan, { ...line[1], timestamp: 1 }, segmentStart);
  state = advanceCompletion(state, plan, { ...line[1], timestamp: 120_001 });
  expect(state.next).toBe(1);
  expect(hasCompleted(state, plan)).toBe(false);
});

it.each(["forward", "reverse"] as const)("%s 왕복 코스를 약 200m 간격으로 이동하면 귀환까지 인정한다", (direction) => {
  const start = line[0];
  const turn = { lat: start.lat + 1000 / 111_320, lng: start.lng };
  const plan = completionPlan([start, turn, start], direction);
  let state: CompletionState | null = null;
  for (let step = 0; step <= 10; step++) {
    const fraction = step <= 5 ? step / 5 : (10 - step) / 5;
    state = advanceCompletion(state, plan, {
      lat: start.lat + (turn.lat - start.lat) * fraction,
      lng: start.lng,
      timestamp: step * 200 / 3 * 1000,
    });
    if (step < 10) expect(hasCompleted(state, plan)).toBe(false);
  }
  expect(hasCompleted(state, plan)).toBe(true);
});

it.each([false, true])("건너뛴 지점은 이후 정상 이동으로 소급 인정하지 않고 돌아와야 한다 (재개: %s)", (segmentStart) => {
  const plan = completionPlan(line, "forward");
  let state = advanceCompletion(null, plan, { ...plan.points[0], timestamp: 0 });
  state = advanceCompletion(state, plan, { ...plan.points[5], timestamp: 1 }, segmentStart);
  state = advanceCompletion(state, plan, { ...plan.points[6], timestamp: 120_001 });
  expect(state.next).toBe(1);
  state = advanceCompletion(state, plan, { ...plan.points[1], timestamp: 300_001 });
  expect(state.next).toBe(2);
  for (let i = 2; i < plan.points.length; i++) {
    state = advanceCompletion(state, plan, { ...plan.points[i], timestamp: 300_001 + i * 60_000 });
  }
  expect(hasCompleted(state, plan)).toBe(true);
});

it("왕복 코스에서 반환점을 관측하지 못하면 200m 간격 이동만으로 완주를 인증하지 않는다", () => {
  const [start, turn] = line;
  const half = haversineMeters(start, turn);
  const total = half * 2;
  const plan = completionPlan([start, turn, start], "forward");
  let state: CompletionState | null = null;
  for (let travelled = 0; travelled < total; travelled += 200) {
    const fraction = travelled <= half ? travelled / half : (total - travelled) / half;
    state = advanceCompletion(state, plan, {
      lat: start.lat + (turn.lat - start.lat) * fraction,
      lng: start.lng,
      timestamp: travelled / 3 * 1000,
    });
    expect(hasCompleted(state, plan)).toBe(false);
  }
  state = advanceCompletion(state, plan, { ...start, timestamp: total / 3 * 1000 });
  expect(hasCompleted(state, plan)).toBe(false);
});

it.each(["forward", "reverse"] as const)("%s 왕복 코스 중간에서 돌아오면 오래 걸려도 완주하지 않는다", (direction) => {
  const plan = completionPlan([...line, line[0]], direction);
  let state = advanceCompletion(null, plan, { ...line[0], timestamp: 0 });
  state = advanceCompletion(state, plan, { lat: 37.005, lng: 127, timestamp: 200_000 });
  const next = state.next;
  state = advanceCompletion(state, plan, { ...line[0], timestamp: 400_000 });
  state = advanceCompletion(state, plan, { ...line[0], timestamp: 4_000_000 });
  expect(state.next).toBe(next);
  expect(hasCompleted(state, plan)).toBe(false);
  // 미통과 지점으로 복귀한 뒤 반환점을 포함해 실제로 돌면 회복할 수 있다.
  for (let i = 1; i < plan.points.length; i++) {
    state = advanceCompletion(state, plan, { ...plan.points[i], timestamp: 4_000_000 + i * 60_000 });
  }
  expect(hasCompleted(state, plan)).toBe(true);
});

it.each([12, 20, 30])("교차점에서 약 %sm 흔들림과 긴 대기가 미래 구간 통과로 바뀌지 않는다", (jitter) => {
  const xy = (x: number, y: number): LatLng => ({ lat: 37 + y / 111_320, lng: 127 + x / (111_320 * Math.cos(37 * Math.PI / 180)) });
  const plan = completionPlan([xy(-200, -200), xy(200, 200), xy(-200, 200), xy(200, -200)], "forward");
  let state = advanceCompletion(null, plan, { ...plan.points[0], timestamp: 0 });
  state = advanceCompletion(state, plan, { ...xy(jitter / 1.5, jitter / 1.5), timestamp: 120_000 });
  const next = state.next;
  for (let i = 1; i <= 20; i++) {
    state = advanceCompletion(state, plan, { ...xy(i % 2 ? -2.2 : jitter / 1.5, i % 2 ? 0.9 : jitter / 1.5), timestamp: 120_000 + i * 120_000 });
    expect(state.next).toBe(next);
    expect(state.progress!.distanceM).toBeLessThan(330);
  }
  // 교차점 이후의 마지막 대각선으로 빠져도 중간 고리를 소급 인정하지 않는다.
  state = advanceCompletion(state, plan, { ...plan.points.at(-1)!, timestamp: 4_000_000 });
  expect(hasCompleted(state, plan)).toBe(false);
  for (let i = next; i < plan.points.length; i++) {
    state = advanceCompletion(state, plan, { ...plan.points[i], timestamp: 4_000_000 + i * 60_000 });
  }
  expect(hasCompleted(state, plan)).toBe(true);
});

it("이전 판정 버전의 완주 상태는 새 방문 확인 규칙으로 복원하지 않는다", () => {
  const plan = completionPlan(line, "forward");
  expect(hasCompleted({ key: JSON.stringify(["forward", line]), next: plan.points.length }, plan)).toBe(false);
});

it.each(["forward", "reverse"] as const)("%s 완만하게 교차하는 코스도 고리 내부를 건너뛰면 완주하지 않는다", (direction) => {
  const path = Array.from({ length: 65 }, (_, i) => {
    const angle = i * Math.PI / 32;
    return { lat: 37 + 0.003 * Math.sin(angle * 2), lng: 127 + 0.004 * Math.sin(angle) };
  });
  const plan = completionPlan(path, direction);
  expect(plan.turnarounds.length).toBe(0);
  expect(plan.requiredVisits.length).toBeGreaterThan(0);
  let state = advanceCompletion(null, plan, { ...plan.points[0], timestamp: 0 });
  state = advanceCompletion(state, plan, { ...plan.points[Math.floor(plan.points.length * 0.8)], timestamp: 1_000_000 });
  state = advanceCompletion(state, plan, { ...plan.points.at(-1)!, timestamp: 2_000_000 });
  expect(hasCompleted(state, plan)).toBe(false);
  // 실제로 모든 구간을 진행하면 모호한 교차점에서 멈췄더라도 다시 이어갈 수 있다.
  for (let i = 0; i < plan.points.length; i++) {
    state = advanceCompletion(state, plan, { ...plan.points[i], timestamp: 2_000_000 + (i + 1) * 60_000 });
  }
  expect(hasCompleted(state, plan)).toBe(true);
});

it("반환점 관측은 10m GPS 오차를 허용하고 저장·복원 후에도 귀환 구간을 유지한다", () => {
  const start = line[0];
  const turn = { lat: 37 + 1000 / 111_320, lng: 127 };
  const end = { lat: 37 + 150 / 111_320, lng: 127 };
  const plan = completionPlan([start, turn, end], "forward");
  const turnIndex = plan.turnarounds[0];
  let state: CompletionState | null = null;
  for (let i = 0; i <= turnIndex; i++) {
    const point = plan.points[i];
    state = advanceCompletion(state, plan, { ...point, lng: point.lng + (i === turnIndex ? 10 / 88_900 : 0), timestamp: i * 60_000 });
  }
  expect(state!.next).toBe(turnIndex + 1);
  state = JSON.parse(JSON.stringify(state));
  for (let i = turnIndex + 1; i < plan.points.length; i++) {
    state = advanceCompletion(state, plan, { ...plan.points[i], timestamp: i * 60_000 });
  }
  expect(hasCompleted(state, plan)).toBe(true);
});

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
