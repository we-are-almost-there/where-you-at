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
    // 뒤로/앞으로 가기는 스크롤 복원과 함께 다뤄야 해서 이번 범위에서 제외한다.
    // 단일 페이지 앱의 방문 기록 이동에는 브라우저의 포커스 복원이 없으므로,
    // 기존 포커스 요소가 제거되면 문서 본문으로 포커스가 떨어질 수 있다.
    if (navigationType === "POP") return;
    const page = pageRef.current;
    if (!page) return;
    // 앱이 경로별 화면의 부모이므로 드로어의 레이아웃 효과 정리(비활성화 해제)와
    // 일반 효과 정리(포커스 복귀)가 이 일반 효과보다 먼저 실행된다.
    const target = page.querySelector<HTMLElement>("h1")
      ?? page.querySelector<HTMLElement>("main")
      ?? (page.firstElementChild as HTMLElement | null);
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    if (target.matches("h1")) return;

    // 데이터 로드 뒤 나타나는 제목으로 이동하되 사용자가 옮긴 포커스는 유지한다.
    const observer = new MutationObserver(() => {
      const heading = page.querySelector<HTMLElement>("h1");
      if (!heading) return;
      observer.disconnect();
      if (document.activeElement !== target) return;
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    });
    observer.observe(page, { childList: true, subtree: true });
    return () => observer.disconnect();
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
