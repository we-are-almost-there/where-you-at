import type { TrackingRecord } from "./trackingRecord";
import type { LatLng, RouteType } from "./types";

export interface SavedRecord {
  summary: TrackingRecord;
  routeType: RouteType;
  routePoints: LatLng[];
}

/** 손상된 저장값이 기록 카드로 전달되지 않도록 복원 전에 확인한다. */
export function isSavedRecord(value: unknown): value is SavedRecord {
  if (!value || typeof value !== "object") return false;
  const { summary, routeType, routePoints } = value as Partial<SavedRecord>;
  return !!summary && typeof summary === "object"
    && Number.isFinite(summary.distanceKm) && summary.distanceKm >= 0
    && Number.isFinite(summary.durationMs) && summary.durationMs >= 0
    && (summary.paceSecPerKm === null
      || (Number.isFinite(summary.paceSecPerKm) && summary.paceSecPerKm >= 0))
    && (routeType === "도보" || routeType === "자전거")
    && Array.isArray(routePoints)
    && routePoints.every((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

/** 같은 탭의 새로고침 복원용. 저장소를 사용할 수 없어도 따라가기는 계속한다. */
export function readSession<T>(key: string): T | null {
  try { return JSON.parse(sessionStorage.getItem(key) ?? "null") as T | null; }
  catch { return null; }
}

export function writeSession(key: string, value: unknown) {
  try {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 최신 기록을 저장하지 못하면 오래된 기록이 복원되지 않도록 삭제한다.
    try { sessionStorage.removeItem(key); }
    catch { /* 저장소 접근 차단 시에도 따라가기는 계속한다. */ }
  }
}
