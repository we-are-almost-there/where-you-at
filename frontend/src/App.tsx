import { useEffect, useRef } from "react";
import { Routes, Route, useLocation, useNavigationType } from "react-router";
import { Home } from "./features/home";
import { CourseExplore, CourseDetail } from "./features/map";
import { Support } from "./features/support";
import { Race } from "./features/race";
import { BicycleExplore } from "./features/bicycle";
import { ContactPage, FaqPage, HelpPage, NoticeDetail, NoticeList, PrivacyPage, TermsPage } from "./features/help";
import { NotFoundPage } from "./features/notFound";
// 다른 페이지와 달리 배럴이 아니라 파일에서 직접 가져온다. 이유는 features/auth/index.ts 주석 참고.
import KakaoCallback from "./features/auth/KakaoCallback";
import { KAKAO_CALLBACK_PATH } from "./features/auth";

function App() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const previousPathname = useRef(pathname);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    // 뒤로/앞으로 가기는 브라우저의 기본 복원에 맡긴다.
    if (navigationType === "POP") return;
    const page = pageRef.current;
    if (!page) return;
    // 이전 사이드바의 inert 해제와 포커스 복귀가 끝난 뒤 실행한다.
    const target = page.querySelector<HTMLElement>("h1")
      ?? page.querySelector<HTMLElement>("main")
      ?? (page.firstElementChild as HTMLElement | null);
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }, [pathname, navigationType]);

  return (
    <div ref={pageRef} className="contents">
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
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/bicycle-facilities" element={<BicycleExplore />} />
        <Route path={KAKAO_CALLBACK_PATH} element={<KakaoCallback />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

export default App;
