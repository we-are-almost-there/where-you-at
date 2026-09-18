import { useEffect } from "react";

export const SITE_NAME = "어디까지왔니";

/**
 * 탭 제목을 "페이지 이름 | 어디까지왔니"로 바꾼다.
 * 모든 페이지가 같은 제목이면 탭·방문 기록·화면낭독기에서 페이지를 구분할 수 없다(WCAG 2.4.2).
 * 페이지 이름이 아직 없으면(상세 데이터 로딩 중 등) 서비스 이름만 쓴다.
 */
export function useDocumentTitle(pageTitle?: string | null) {
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} | ${SITE_NAME}` : SITE_NAME;
  }, [pageTitle]);
}
