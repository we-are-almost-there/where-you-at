import { haversineMeters } from "./courseProgress";
import type { LatLng, RouteType } from "./types";

/** 추적 중 쌓아 둔 위치 표본. 진행률과 달리 "실제 이동한 궤적"이라 시각도 함께 보관한다. */
export interface RecordPoint extends LatLng {
  accuracy: number;
  timestamp: number;
  /** 일시정지 후 재개해 새로 시작한 구간의 첫 표본. 앞 표본과 이어 붙이지 않는다. */
  segmentStart?: boolean;
}

/** 따라가기 한 세션의 기록. 서버에 저장하지 않고 종료 화면에서만 쓴다. */
export interface TrackingRecord {
  distanceKm: number;
  durationMs: number;
  /** 평균 페이스(초/km). 거리가 너무 짧아 의미가 없으면 null. */
  paceSecPerKm: number | null;
}

// 정확도가 이보다 나쁜 표본은 버린다. 도심에서는 오차가 수십 m씩 튄다.
const MAX_ACCURACY_M = 30;
// 이보다 짧은 이동은 정지 중 지터로 본다. 걸러내지 않으면 서 있어도 거리가 늘어난다.
const MIN_STEP_M = 5;
// 이보다 빠르면 GPS 튐으로 본다(=108km/h). 실제 튐은 수백 m/s라 이 값으로도 충분히 걸러지고,
// 자전거 내리막(최고 60km/h대)을 이상치로 오인하지 않는다.
const MAX_SPEED_MPS = 30;
// 이 아래 거리는 페이스를 내도 무의미해 null로 둔다.
const MIN_PACE_DISTANCE_KM = 0.01;

/**
 * 표본 사이 거리를 누적한 실제 이동 거리(m).
 * 버려진 표본은 기준점을 갱신하지 않는다 — 튄 점 하나 때문에 이후 구간까지 어긋나면 안 된다.
 */
export function accumulateDistanceMeters(points: RecordPoint[]): number {
  let total = 0;
  let prev: RecordPoint | null = null;

  for (const point of points) {
    // 재개 직후 첫 표본은 기준점만 새로 잡고 거리를 더하지 않는다.
    // 정지가 길면 그사이 이동한 거리가 낮은 속도로 계산돼 아래 MAX_SPEED_MPS 필터를 그대로 통과한다.
    // 정확도 검사보다 먼저 본다 — 이 표본을 버리더라도 구간 경계는 남겨야 한다.
    // 재개 직후 첫 표본은 대개 기지국 기반이라 정확도가 나쁜데, 여기서 통째로 버리면
    // 기준점이 정지 이전 지점에 남아 정지 중 이동이 다시 거리에 섞인다.
    if (point.segmentStart) {
      prev = point.accuracy > MAX_ACCURACY_M ? null : point;
      continue;
    }
    if (point.accuracy > MAX_ACCURACY_M) continue;
    if (!prev) {
      prev = point;
      continue;
    }

    const meters = haversineMeters(prev, point);
    if (meters < MIN_STEP_M) continue;

    // 시각이 흐르지 않았거나 거꾸로 간 표본은 속도를 잴 수 없다.
    // 검사를 건너뛰면 튐이 그대로 거리에 더해지므로 아예 버린다.
    const seconds = (point.timestamp - prev.timestamp) / 1000;
    if (seconds <= 0) continue;
    if (meters / seconds > MAX_SPEED_MPS) continue;

    total += meters;
    prev = point;
  }
  return total;
}

/**
 * 세션을 요약한다. durationMs는 벽시계가 아니라 "일시정지를 뺀 활동 시간"이라
 * 호출자가 구간별로 누적해 넘긴다 — 여기서 시작/종료 시각을 빼면 정지 시간이 섞인다.
 */
export function summarize(points: RecordPoint[], activeMs: number): TrackingRecord {
  const distanceKm = accumulateDistanceMeters(points) / 1000;
  const durationMs = Math.max(0, activeMs);
  return {
    distanceKm,
    durationMs,
    paceSecPerKm:
      distanceKm >= MIN_PACE_DISTANCE_KM && durationMs > 0 ? durationMs / 1000 / distanceKm : null,
  };
}

/** 5.01 — 러닝 앱 관례대로 소수 둘째 자리까지. */
export function formatDistance(km: number): string {
  return km.toFixed(2);
}

/** 6'19" — 분'초". 값이 없으면 자리만 채운다. */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm == null || !Number.isFinite(secPerKm)) return "--'--\"";
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, "0")}"`;
}

/** 19.0 — km/h. 페이스의 역수라 같은 기록을 뒤집어 읽은 값이다. 값이 없으면 자리만 채운다. */
export function formatSpeedKmh(secPerKm: number | null): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return "--.-";
  return (3600 / secPerKm).toFixed(1);
}

export interface PaceStat {
  /** 칸에 크게 찍히는 값. */
  value: string;
  /** 값 옆에 붙는 단위. 도보는 기호가 값 안에 들어 있어 비어 있다. */
  unit: string;
  /** 수치 아래 이름. */
  caption: string;
}

/**
 * 종목마다 읽는 관례가 다르다 — 도보는 1km에 몇 분, 자전거는 시속 몇 km.
 * 값과 이름이 함께 바뀌므로 한 곳에서 같이 정한다. 부르는 쪽에서 따로 고르면 짝이 어긋난다.
 */
export function paceStat(secPerKm: number | null, routeType: RouteType): PaceStat {
  return routeType === "자전거"
    ? { value: formatSpeedKmh(secPerKm), unit: "km/h", caption: "평균 속도" }
    : { value: formatPace(secPerKm), unit: "", caption: "평균 페이스" };
}

/** 33:23 / 1:01:28 — 한 시간을 넘을 때만 시간 자리를 붙인다. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}` : `${minutes}:${ss}`;
}
