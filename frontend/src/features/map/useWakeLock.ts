import { useEffect, useRef, useState } from "react";

// 문장 단위로 줄을 나눠 둔다. 한 줄로 흘리면 폭에 따라 문장 한가운데서 끊겨
// "무엇이 안 됐는지"와 "무엇을 하면 되는지"가 뒤섞인다.
export const WAKE_LOCK_FAILURE_LINES = [
  "화면 꺼짐 방지를 켜지 못했어요.",
  "기기 설정에서 화면 자동 꺼짐 시간을 늘려 주세요.",
];

/**
 * 지금 Wake Lock을 요청해야 하는지 판정한다.
 * 화면이 가려지면 브라우저가 sentinel을 스스로 해제하므로, 다시 보이는 시점에 재요청이 필요하다.
 */
export function shouldRequestWakeLock(
  active: boolean,
  visibilityState: DocumentVisibilityState,
  hasSentinel: boolean,
): boolean {
  return active && visibilityState === "visible" && !hasSentinel;
}

/**
 * active인 동안 화면이 꺼지지 않게 유지한다.
 * 미지원 브라우저나 요청 실패는 호출자의 기능을 막지 않고 실패 여부(true)로만 알린다.
 */
export function useWakeLock(active: boolean): boolean {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);
  const supported = "wakeLock" in navigator;

  useEffect(() => {
    if (!active || !supported) return;

    let cancelled = false;

    // released는 브라우저가 자동 해제한 sentinel까지 걸러준다(화면 가림 등).
    const hasLiveSentinel = () => sentinelRef.current != null && !sentinelRef.current.released;

    const request = async () => {
      if (!shouldRequestWakeLock(active, document.visibilityState, hasLiveSentinel())) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        // 요청이 도착하기 전에 추적이 끝났을 수 있다. 그냥 두면 화면이 켜진 채로 남는다.
        if (cancelled) {
          void sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        setRequestFailed(false);
      } catch {
        // 화면이 가려진 사이의 실패는 정상 동작이라 안내하지 않는다.
        if (cancelled || document.visibilityState !== "visible") return;
        setRequestFailed(true);
      }
    };

    const handleVisibilityChange = () => void request();

    void request();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      // 이미 풀린 sentinel의 release()는 거부될 수 있지만 목적은 달성된 상태라 무시한다.
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
    };
  }, [active, supported]);

  // 추적이 끝나면 안내도 함께 사라지도록 active를 곱한다.
  return active && (!supported || requestFailed);
}
