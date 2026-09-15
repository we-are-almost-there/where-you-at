import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import LocationConsentDialog from "./LocationConsentDialog";
import {
  LocationConsentContext,
  type LocationConsentRequestOptions,
} from "./locationConsentContext";

export const LOCATION_CONSENT_STORAGE_KEY = "where-you-at:location-consent";

type Decision = "allowed" | "declined" | null;

function readStoredDecision(): Decision {
  try {
    const stored = window.localStorage.getItem(LOCATION_CONSENT_STORAGE_KEY);
    return stored === "allowed" || stored === "declined" ? stored : null;
  } catch {
    return null;
  }
}

function storeDecision(decision: Exclude<Decision, null>) {
  try {
    window.localStorage.setItem(LOCATION_CONSENT_STORAGE_KEY, decision);
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 현재 페이지를 이용하는 동안의 선택만 유지한다.
  }
}

export default function LocationConsentProvider({ children }: { children: ReactNode }) {
  // 요청 함수의 참조가 선택할 때마다 바뀌면 이를 의존하는 화면 effect가 다시 실행되어
  // 위치·목록을 중복 요청한다. 화면에 그릴 값이 아니므로 ref로 유지한다.
  const decisionRef = useRef<Decision>(readStoredDecision());
  const [dialogOpen, setDialogOpen] = useState(false);
  const pendingRef = useRef<Array<(allowed: boolean) => void>>([]);

  const requestConsent = useCallback(
    ({ promptWhenDeclined = false }: LocationConsentRequestOptions = {}) => {
      if (decisionRef.current === "allowed") return Promise.resolve(true);
      if (decisionRef.current === "declined" && !promptWhenDeclined) return Promise.resolve(false);

      setDialogOpen(true);
      return new Promise<boolean>((resolve) => pendingRef.current.push(resolve));
    },
    [],
  );

  const settle = useCallback((nextDecision: Exclude<Decision, null>) => {
    const allowed = nextDecision === "allowed";
    storeDecision(nextDecision);
    decisionRef.current = nextDecision;
    setDialogOpen(false);
    pendingRef.current.splice(0).forEach((resolve) => resolve(allowed));
  }, []);
  const allow = useCallback(() => settle("allowed"), [settle]);
  const decline = useCallback(() => settle("declined"), [settle]);

  // 앱이 닫히는 순간 기다리던 호출이 남아 있으면 위치를 사용하지 않는 것으로 끝낸다.
  useEffect(
    () => () => pendingRef.current.splice(0).forEach((resolve) => resolve(false)),
    [],
  );

  const value = useMemo(() => ({ requestConsent }), [requestConsent]);

  return (
    <LocationConsentContext.Provider value={value}>
      {children}
      {dialogOpen && (
        <LocationConsentDialog onAllow={allow} onDecline={decline} />
      )}
    </LocationConsentContext.Provider>
  );
}
