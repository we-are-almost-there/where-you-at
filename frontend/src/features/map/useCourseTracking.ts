import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "./types";
import { summarize, type RecordPoint, type TrackingRecord } from "./trackingRecord";
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

export function useCourseTracking() {
  const watchIdRef = useRef<number | null>(null);
  // 기록은 화면에 실시간으로 그리지 않고 종료 시 한 번만 요약하므로 ref로 모은다(렌더 유발 없음).
  const pointsRef = useRef<RecordPoint[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<TrackedLocation | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 추적 상태에만 묶어 둔다. 종료 경로(종료 버튼·탭 이동·권한 거부·언마운트)가 여럿이라
  // 각자 해제하게 하면 하나만 빠져도 화면이 켜진 채 남는다.
  const wakeLockFailed = useWakeLock(isTracking);

  const clearActiveWatch = useCallback(() => {
    if (watchIdRef.current == null) return;
    navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  }, []);

  /** 추적을 멈추고 이번 세션의 기록을 돌려준다. 시작한 적이 없으면 null. */
  const stopTracking = useCallback((): TrackingRecord | null => {
    clearActiveWatch();
    setIsTracking(false);
    setCurrentLocation(null);
    setError(null);

    const startedAt = startedAtRef.current;
    const points = pointsRef.current;
    startedAtRef.current = null;
    pointsRef.current = [];
    return startedAt == null ? null : summarize(points, startedAt, Date.now());
  }, [clearActiveWatch]);

  const startTracking = useCallback(() => {
    if (watchIdRef.current != null) return;
    if (!navigator.geolocation) {
      setError("현재 위치 기능을 사용할 수 없어요. HTTPS 또는 localhost에서 실행해 주세요.");
      return;
    }

    setError(null);
    pointsRef.current = [];
    startedAtRef.current = Date.now();
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        ({ coords, timestamp }) => {
          setCurrentLocation({
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            heading: coords.heading,
          });
          pointsRef.current.push({
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            timestamp,
          });
          setError(null);
        },
        ({ code }) => {
          setError(getGeolocationErrorMessage(code));
          if (!isTerminalGeolocationError(code)) return;
          clearActiveWatch();
          setIsTracking(false);
          setCurrentLocation(null);
          // 권한 거부로 시작조차 못 했으므로 기록도 남기지 않는다.
          startedAtRef.current = null;
          pointsRef.current = [];
        },
        GEOLOCATION_OPTIONS,
      );
      setIsTracking(true);
    } catch {
      clearActiveWatch();
      setIsTracking(false);
      startedAtRef.current = null;
      setError("현재 위치를 불러오지 못했어요. 다시 시도해 주세요.");
    }
  }, [clearActiveWatch]);

  useEffect(() => clearActiveWatch, [clearActiveWatch]);

  return { currentLocation, isTracking, error, wakeLockFailed, startTracking, stopTracking };
}
