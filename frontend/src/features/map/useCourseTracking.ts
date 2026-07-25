import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "./types";
import { useWakeLock } from "./useWakeLock";

export interface TrackedLocation extends LatLng {
  accuracy: number;
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

  const stopTracking = useCallback(() => {
    clearActiveWatch();
    setIsTracking(false);
    setCurrentLocation(null);
    setError(null);
  }, [clearActiveWatch]);

  const startTracking = useCallback(() => {
    if (watchIdRef.current != null) return;
    if (!navigator.geolocation) {
      setError("현재 위치 기능을 사용할 수 없어요. HTTPS 또는 localhost에서 실행해 주세요.");
      return;
    }

    setError(null);
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        ({ coords }) => {
          setCurrentLocation({
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
          });
          setError(null);
        },
        ({ code }) => {
          setError(getGeolocationErrorMessage(code));
          if (!isTerminalGeolocationError(code)) return;
          clearActiveWatch();
          setIsTracking(false);
          setCurrentLocation(null);
        },
        GEOLOCATION_OPTIONS,
      );
      setIsTracking(true);
    } catch {
      clearActiveWatch();
      setIsTracking(false);
      setError("현재 위치를 불러오지 못했어요. 다시 시도해 주세요.");
    }
  }, [clearActiveWatch]);

  useEffect(() => clearActiveWatch, [clearActiveWatch]);

  return { currentLocation, isTracking, error, wakeLockFailed, startTracking, stopTracking };
}
