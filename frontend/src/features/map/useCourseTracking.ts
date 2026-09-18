import { useCallback, useEffect, useRef, useState } from "react";
import { readSession, writeSession } from "./trackingSession";
import type { LatLng } from "./types";
import { distanceCheckpoint, summarize, type RecordPoint, type TrackingRecord } from "./trackingRecord";
import { useWakeLock } from "./useWakeLock";

export interface TrackedLocation extends LatLng {
  accuracy: number;
  // 이동 방향(도, 북쪽=0, 시계방향). 정지 상태거나 기기가 못 주면 null.
  heading: number | null;
}

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 3_000,
  timeout: 10_000,
};

export function getGeolocationErrorMessage(code: number): string {
  if (code === 1) return "현재 위치를 사용하려면 위치 권한을 허용해 주세요.";
  if (code === 2) return "현재 위치를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.";
  if (code === 3) return "현재 위치 확인에 시간이 오래 걸리고 있어요. 다시 시도해 주세요.";
  return "현재 위치를 불러오지 못했어요. 다시 시도해 주세요.";
}

export function isTerminalGeolocationError(code: number): boolean {
  return code === 1;
}

/** idle=시작 전, tracking=따라가는 중, paused=주변 정보를 보느라 잠시 멈춘 상태. */
export type TrackingStatus = "idle" | "tracking" | "paused";

const AUTO_RESUME_MAX_AGE_MS = 30 * 60 * 1000;
// 약 1초 간격에서도 원시 표본은 최대 약 17분만 보관한다. 거리는 체크포인트에 누적한다.
export const MAX_TRACKING_POINTS = 1024;

interface SavedTracking {
  savedAt?: number;
  currentLocation?: TrackedLocation | null;
  points: RecordPoint[];
  distanceMeters?: number;
  activeMs: number;
  status: TrackingStatus;
}

function restoreLocation(saved: SavedTracking | null): TrackedLocation | null {
  const location = saved?.currentLocation;
  if (location && typeof location === "object"
    && Number.isFinite(location.lat) && Math.abs(location.lat) <= 90
    && Number.isFinite(location.lng) && Math.abs(location.lng) <= 180
    && Number.isFinite(location.accuracy) && location.accuracy >= 0
    && (location.heading === null
      || (Number.isFinite(location.heading) && location.heading >= 0 && location.heading < 360))) {
    return { lat: location.lat, lng: location.lng, accuracy: location.accuracy, heading: location.heading };
  }
  // 위치를 따로 저장하지 않은 기존 세션은 마지막 기록 표본으로 마커를 복원한다.
  const point = saved?.points.at(-1);
  return point && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 && point.accuracy >= 0
    ? { lat: point.lat, lng: point.lng, accuracy: point.accuracy, heading: null } : null;
}

export function useCourseTracking(sessionKey?: string) {
  const [saved] = useState(() => {
    const value = sessionKey ? readSession<SavedTracking>(sessionKey) : null;
    return value && Array.isArray(value.points)
      && value.points.every((point) => point && [point.lat, point.lng, point.accuracy, point.timestamp].every(Number.isFinite))
      && Number.isFinite(value.activeMs)
      && (value.distanceMeters === undefined || (Number.isFinite(value.distanceMeters) && value.distanceMeters >= 0))
      && value.activeMs >= 0 && (value.status === "tracking" || value.status === "paused")
      ? {
        ...value,
        status: value.status === "tracking" && Number.isFinite(value.savedAt)
          && Date.now() - value.savedAt! >= 0
          && Date.now() - value.savedAt! < AUTO_RESUME_MAX_AGE_MS
          ? "tracking" as const : "paused" as const,
      } : null;
  });
  const watchIdRef = useRef<number | null>(null);
  const watchGenerationRef = useRef(0);
  // 기록은 화면에 실시간으로 그리지 않고 종료 시 한 번만 요약하므로 ref로 모은다(렌더 유발 없음).
  const pointsRef = useRef<RecordPoint[]>(saved?.points ?? []);
  const distanceMetersRef = useRef(saved?.distanceMeters ?? 0);
  // 소요시간은 벽시계가 아니라 활동 시간으로 센다. 끝난 구간들의 합과 지금 구간의 시작 시각을
  // 따로 들고 있어야 일시정지 구간을 뺄 수 있다(정지 중이면 segmentStartedAt은 null).
  const activeMsRef = useRef(saved?.activeMs ?? 0);
  const segmentStartedAtRef = useRef<number | null>(null);
  const startedRef = useRef(saved != null); // 세션을 시작한 적이 있는지 — 기록을 남길지 판단한다
  // 재개 후 첫 표본에 구간 경계를 찍기 위한 1회성 플래그.
  // 성공 표본이 소비할 때까지 유지한다 — 에러 콜백에서 내리면 watch가 살아남는 에러 뒤에
  // 들어온 첫 표본이 경계를 잃고, 정지 중 이동한 거리가 누적 거리에 섞인다.
  const resumedRef = useRef(saved != null);
  const [currentLocation, setCurrentLocation] = useState<TrackedLocation | null>(() => restoreLocation(saved));
  // 저장 콜백은 최신 위치를 읽되 위치 표본마다 저장 타이머를 다시 등록하지 않는다.
  const currentLocationRef = useRef(currentLocation);
  const [status, setStatus] = useState<TrackingStatus>(saved?.status ?? "idle");
  const [error, setError] = useState<string | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  // 실제로 따라가는 중에만 화면을 붙잡는다. 일시정지는 "당분간 안 움직인다"는 선언이라 놓아준다.
  // 종료 경로(종료 버튼·권한 거부·언마운트)가 여럿이라 각자 해제하게 하면
  // 하나만 빠져도 화면이 켜진 채 남는다.
  const wakeLockFailed = useWakeLock(status === "tracking");

  const clearActiveWatch = useCallback(() => {
    if (watchIdRef.current == null) return;
    watchGenerationRef.current += 1;
    navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  }, []);

  /** 진행 중인 구간을 닫아 활동 시간에 더한다. 이미 닫혀 있으면 아무것도 하지 않는다. */
  const closeSegment = useCallback(() => {
    if (segmentStartedAtRef.current == null) return;
    activeMsRef.current += Date.now() - segmentStartedAtRef.current;
    segmentStartedAtRef.current = null;
  }, []);

  const resetSession = useCallback(() => {
    pointsRef.current = [];
    distanceMetersRef.current = 0;
    activeMsRef.current = 0;
    segmentStartedAtRef.current = null;
    startedRef.current = false;
    resumedRef.current = false;
  }, []);

  /** 위치 감시를 건다. 시작과 재개가 공유한다. 실패하면 false. */
  const beginWatch = useCallback((): boolean => {
    if (!navigator.geolocation) {
      setError("현재 위치 기능을 사용할 수 없어요. HTTPS 또는 localhost에서 실행해 주세요.");
      return false;
    }

    setError(null);
    const generation = ++watchGenerationRef.current;
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        ({ coords, timestamp }) => {
          if (generation !== watchGenerationRef.current) return;
          const location: TrackedLocation = {
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            heading: coords.heading,
          };
          currentLocationRef.current = location;
          setCurrentLocation(location);
          pointsRef.current.push({
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            timestamp,
            ...(resumedRef.current && { segmentStart: true }),
          });
          resumedRef.current = false;
          if (pointsRef.current.length >= MAX_TRACKING_POINTS) {
            const checkpoint = distanceCheckpoint(pointsRef.current, distanceMetersRef.current);
            distanceMetersRef.current = checkpoint.distanceMeters;
            pointsRef.current = checkpoint.anchor ? [{ ...checkpoint.anchor, segmentStart: true }] : [];
          }
          setError(null);
        },
        ({ code }) => {
          if (generation !== watchGenerationRef.current) return;
          setError(getGeolocationErrorMessage(code));
          if (!isTerminalGeolocationError(code)) return;
          clearActiveWatch();
          // 모아 둔 표본이 있으면 세션을 지키고 일시정지로 되돌린다.
          // 여기서 초기화하면 재개하다 거부당한 사람의 기록이 통째로 사라지고,
          // idle이 되면서 종료 버튼까지 없어져 남길 방법 자체가 사라진다.
          // 마지막 위치도 남긴다 — 일시정지는 원래 마커를 지우지 않는다.
          if (pointsRef.current.length > 0 || distanceMetersRef.current > 0) {
            closeSegment(); // 안 닫으면 구간이 열린 채 남아 정지 시간이 활동 시간에 더해진다
            setStatus("paused");
            return;
          }
          // 표본이 하나도 없으면 남길 기록이 없다(시작하자마자 거부당한 경우).
          setStatus("idle");
          currentLocationRef.current = null;
          setCurrentLocation(null);
          resetSession();
        },
        GEOLOCATION_OPTIONS,
      );
      return true;
    } catch {
      clearActiveWatch();
      setError("현재 위치를 불러오지 못했어요. 다시 시도해 주세요.");
      return false;
    }
  }, [clearActiveWatch, closeSegment, resetSession]);

  /**
   * 진행 중인 세션을 지금 시점으로 요약한다. 시작한 적이 없으면 null.
   * 종료 시와 같은 summarize를 쓰므로 주행 중 보던 값과 끝나고 나온 기록이 어긋나지 않는다.
   * 표본이 들어올 때마다 렌더하지 않도록 상태로 들고 있지 않고, 부르는 쪽이 원하는 주기로 뽑아 간다.
   */
  const sampleRecord = useCallback((): TrackingRecord | null => {
    if (!startedRef.current) return null;
    // 열려 있는 구간은 닫지 않고 경과분만 더한다 — 여기서 닫으면 실제 정지가 아닌데 구간이 끊긴다.
    const openMs = segmentStartedAtRef.current == null ? 0 : Date.now() - segmentStartedAtRef.current;
    return summarize(pointsRef.current, activeMsRef.current + openMs, distanceMetersRef.current);
  }, []);

  /** 추적을 멈추고 이번 세션의 기록을 돌려준다. 시작한 적이 없으면 null. */
  const stopTracking = useCallback((): TrackingRecord | null => {
    clearActiveWatch();
    closeSegment();
    setStatus("idle");
    currentLocationRef.current = null;
    setCurrentLocation(null);
    setError(null);

    const started = startedRef.current;
    const points = pointsRef.current;
    const activeMs = activeMsRef.current;
    const distanceMeters = distanceMetersRef.current;
    resetSession();
    return started ? summarize(points, activeMs, distanceMeters) : null;
  }, [clearActiveWatch, closeSegment, resetSession]);

  const startTracking = useCallback(() => {
    if (watchIdRef.current != null) return;
    resetSession();
    if (!beginWatch()) return;
    startedRef.current = true;
    segmentStartedAtRef.current = Date.now();
    setStatus("tracking");
  }, [beginWatch, resetSession]);

  /**
   * 위치 감시만 멈춘다. 기록과 마지막 위치는 그대로 둬서 재개할 수 있게 한다.
   * 따라가는 중이 아니면 아무것도 하지 않는다(주변 탭을 여러 번 오가도 안전하게).
   */
  const pause = useCallback(() => {
    if (watchIdRef.current == null) return;
    clearActiveWatch();
    closeSegment();
    setStatus("paused");
    setError(null);
  }, [clearActiveWatch, closeSegment]);

  const resume = useCallback(() => {
    if (!startedRef.current || watchIdRef.current != null) return;
    // 정지 중 이동한 거리가 누적 거리에 섞이지 않도록 다음 표본에서 궤적을 끊는다.
    resumedRef.current = true;
    if (!beginWatch()) {
      resumedRef.current = false;
      return;
    }
    segmentStartedAtRef.current = Date.now();
    setStatus("tracking");
  }, [beginWatch]);

  const persist = useCallback(() => {
    if (!sessionKey) return;
    const openMs = segmentStartedAtRef.current == null ? 0 : Date.now() - segmentStartedAtRef.current;
    // 기존 버전에서 복원된 대용량 세션도 첫 저장 전에 줄인다.
    const checkpoint = distanceCheckpoint(pointsRef.current, distanceMetersRef.current);
    const success = writeSession(sessionKey, startedRef.current ? {
      points: checkpoint.anchor ? [{ ...checkpoint.anchor, segmentStart: true }] : [],
      distanceMeters: checkpoint.distanceMeters, activeMs: activeMsRef.current + openMs,
      savedAt: Date.now(),
      currentLocation: currentLocationRef.current,
      status: watchIdRef.current == null ? "paused" : "tracking",
    } : null);
    setStorageFailed(!success);
  }, [sessionKey]);

  useEffect(() => {
    if (saved?.status === "tracking" && watchIdRef.current == null) {
      resumedRef.current = true;
      if (beginWatch()) segmentStartedAtRef.current = Date.now();
      else {
        // 위치 감시 등록에 실패하면 복원된 상태도 일시정지로 맞춘다.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStatus("paused");
      }
    }
    return () => { closeSegment(); clearActiveWatch(); };
  }, [saved, beginWatch, closeSegment, clearActiveWatch]);

  useEffect(() => {
    persist();
    if (status === "idle") return;
    const onHidden = () => { if (document.visibilityState === "hidden") persist(); };
    const timer = setInterval(persist, 5000);
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [persist, status]);

  return {
    currentLocation,
    status,
    error,
    wakeLockFailed,
    storageFailed,
    startTracking,
    pause,
    resume,
    stopTracking,
    sampleRecord,
  };
}
