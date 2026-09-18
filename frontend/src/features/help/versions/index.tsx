import ArchivedLegalPage from "./ArchivedLegalPage";
import PrivacyPolicy20260917 from "./PrivacyPolicy20260917";
import Terms20260917 from "./Terms20260917";

const PERIOD_20260917 = "2026년 9월 17일 ~ 2026년 9월 18일";

export function PrivacyPolicy20260917Page() {
  return (
    <ArchivedLegalPage title="개인정보처리방침" period={PERIOD_20260917} currentPath="/privacy">
      <PrivacyPolicy20260917 />
    </ArchivedLegalPage>
  );
}

export function Terms20260917Page() {
  return (
    <ArchivedLegalPage title="이용약관" period={PERIOD_20260917} currentPath="/terms">
      <Terms20260917 />
    </ArchivedLegalPage>
  );
}
