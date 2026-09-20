import ArchivedLegalPage from "./ArchivedLegalPage";
import PrivacyPolicy20260917 from "./PrivacyPolicy20260917";
import Terms20260917 from "./Terms20260917";
import PrivacyPolicy20260920 from "./PrivacyPolicy20260920";
import Terms20260920 from "./Terms20260920";
import { findPreviousVersion } from "../legalInfo";

// 적용 기간은 legalInfo.ts의 PREVIOUS_VERSIONS에만 적는다. 경로로 찾아 방침·약관의 이전 버전 링크와 같은 기간을 보여 준다.
// 경로는 App.tsx의 라우트와 같아야 한다.

export function PrivacyPolicy20260917Page() {
  const { period } = findPreviousVersion("/privacy/2026-09-17");
  return (
    <ArchivedLegalPage title="개인정보처리방침" period={period} currentPath="/privacy">
      <PrivacyPolicy20260917 />
    </ArchivedLegalPage>
  );
}

export function Terms20260917Page() {
  const { period } = findPreviousVersion("/terms/2026-09-17");
  return (
    <ArchivedLegalPage title="이용약관" period={period} currentPath="/terms">
      <Terms20260917 />
    </ArchivedLegalPage>
  );
}

export function PrivacyPolicy20260920Page() {
  const { period } = findPreviousVersion("/privacy/2026-09-20");
  return (
    <ArchivedLegalPage title="개인정보처리방침" period={period} currentPath="/privacy">
      <PrivacyPolicy20260920 />
    </ArchivedLegalPage>
  );
}

export function Terms20260920Page() {
  const { period } = findPreviousVersion("/terms/2026-09-20");
  return (
    <ArchivedLegalPage title="이용약관" period={period} currentPath="/terms">
      <Terms20260920 />
    </ArchivedLegalPage>
  );
}
