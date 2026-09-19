import { Routes, Route } from "react-router";
import { Home } from "./features/home";
import { CourseExplore, CourseDetail } from "./features/map";
import { Support } from "./features/support";
import { Race } from "./features/race";
import { BicycleExplore } from "./features/bicycle";
import {
  ContactPage,
  FaqPage,
  HelpPage,
  NoticeDetail,
  NoticeList,
  PrivacyPage,
  PrivacyPolicy20260917Page,
  TermsPage,
  Terms20260917Page,
} from "./features/help";
import { NotFoundPage } from "./features/notFound";
import { MyPage, RecordsPage, SavedCoursesPage } from "./features/mypage";
// 다른 페이지와 달리 배럴이 아니라 파일에서 직접 가져온다. 이유는 features/auth/index.ts 주석 참고.
import KakaoCallback from "./features/auth/KakaoCallback";
import { KAKAO_CALLBACK_PATH } from "./features/auth";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/courses" element={<CourseExplore />} />
      <Route path="/courses/:id" element={<CourseDetail />} />
      <Route path="/support" element={<Support />} />
      <Route path="/races" element={<Race />} />
      <Route path="/help" element={<HelpPage />} />
      <Route path="/notices" element={<NoticeList />} />
      <Route path="/notices/:id" element={<NoticeDetail />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      {/* 이전 버전. 방침 14번·약관 부칙에서 링크한다(features/help/legalInfo.ts PREVIOUS_VERSIONS). */}
      <Route path="/terms/2026-09-17" element={<Terms20260917Page />} />
      <Route path="/privacy/2026-09-17" element={<PrivacyPolicy20260917Page />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/bicycle-facilities" element={<BicycleExplore />} />
      <Route path="/mypage" element={<MyPage />} />
      <Route path="/mypage/saved" element={<SavedCoursesPage />} />
      <Route path="/mypage/records" element={<RecordsPage />} />
      <Route path={KAKAO_CALLBACK_PATH} element={<KakaoCallback />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
