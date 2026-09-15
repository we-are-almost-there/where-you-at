import { createContext, useContext } from "react";

export interface LocationConsentRequestOptions {
  /** 앞서 거절했더라도 사용자가 위치 기능을 직접 눌렀다면 다시 선택할 기회를 준다. */
  promptWhenDeclined?: boolean;
}

export interface LocationConsentContextValue {
  requestConsent: (options?: LocationConsentRequestOptions) => Promise<boolean>;
}

export const LocationConsentContext = createContext<LocationConsentContextValue | null>(null);

export function useLocationConsent(): LocationConsentContextValue {
  const context = useContext(LocationConsentContext);
  if (!context) throw new Error("useLocationConsent must be used within LocationConsentProvider");
  return context;
}
