import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import SidebarDrawer from "./SidebarDrawer";
import { MAIN_CONTENT_ID } from "./mainContent";

// 주소에 #main-content를 남기면 라우터가 새 이동으로 받고 새로고침·공유 주소에도 남는다.
// 기본 이동은 막고 본문에 포커스만 옮긴다(포커스가 가면 브라우저가 알아서 스크롤한다).
function skipToMain(event: MouseEvent<HTMLAnchorElement>) {
  const main = document.getElementById(MAIN_CONTENT_ID);
  if (!main) return;
  event.preventDefault();
  main.focus();
}

interface NavItem {
  label: string;
  to: string | null; // null이면 비활성화(준비중)
}

const NAV_ITEMS: NavItem[] = [
  { label: "홈", to: "/" },
  { label: "코스 탐색", to: "/courses" },
  { label: "대회 행사", to: "/races" },
  { label: "방문 혜택", to: "/support" },
  { label: "자전거 대여", to: "/bicycle-facilities" },
];

// 이 페이지가 이미 자체 SidebarDrawer를 렌더링하고 있으면(예: CourseDetail의
// 모바일 지도 위 플로팅 메뉴 버튼) 이 두 prop을 넘겨 상태를 공유시킨다.
// 넘기면 AppHeader는 자신의 <SidebarDrawer>를 렌더링하지 않고 햄버거 클릭도
// 이 핸들러로 위임한다(제어형). 안 넘기면 기존처럼 내부에서 알아서 연다(비제어형).
// 유니온으로 묶은 이유: 하나만 넘기는 실수(예: isSidebarOpen만 넘기고
// onSidebarOpenChange 누락)를 컴파일 타임에 막기 위함
type ControlledSidebarProps =
  | { isSidebarOpen?: undefined; onSidebarOpenChange?: undefined }
  | { isSidebarOpen: boolean; onSidebarOpenChange: (open: boolean) => void };

type Props = ControlledSidebarProps;

export default function AppHeader({
  isSidebarOpen: controlledOpen,
  onSidebarOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isSidebarOpen = isControlled ? controlledOpen : internalOpen;
  const setIsSidebarOpen = isControlled ? onSidebarOpenChange : setInternalOpen;

  const location = useLocation();
  const navigate = useNavigate();
  // /courses 및 그 하위 경로(예: /courses/:id)에서는 CTA를 숨긴다.
  const normalizedPath = location.pathname.replace(/\/+$/, "");
  const hideCourseCta = normalizedPath === "/courses" || normalizedPath.startsWith("/courses/");
  const headerRef = useRef<HTMLElement>(null);
  const alignmentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const header = headerRef.current;
    const alignment = alignmentRef.current;
    if (!header || !alignment) return;

    // 환경별 스크롤바 너비를 측정한다. 오버레이 스크롤바 환경에서는 0이다.
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:100px;height:100px;overflow:scroll;visibility:hidden;pointer-events:none;";
    probe.setAttribute("aria-hidden", "true");
    document.body.appendChild(probe);

    const updateAlignment = () => {
      const scrollbarWidth = probe.offsetWidth - probe.clientWidth;
      // 실제 헤더 폭으로 계산해 이미 확보된 stable 공간도 중복 보정하지 않는다.
      const reservedWidth = Math.max(0, window.innerWidth - header.getBoundingClientRect().width);
      alignment.style.paddingRight = `${Math.max(0, scrollbarWidth - reservedWidth)}px`;
    };

    updateAlignment();
    const observer = new ResizeObserver(updateAlignment);
    observer.observe(header);
    window.addEventListener("resize", updateAlignment);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateAlignment);
      probe.remove();
      alignment.style.paddingRight = "";
    };
  }, [location.pathname]);

  const sidePadding = "px-[max(1rem,calc((100%-72rem)/2+1rem))]";

  return (
    <header ref={headerRef} className="sticky top-0 z-50 shrink-0 border-b border-divider bg-white">
      {/* 키보드 사용자가 매 페이지 메뉴를 반복해서 지나지 않게 한다. 평소엔 숨기고 포커스될 때만 보인다.
          대상은 각 페이지의 <main id={MAIN_CONTENT_ID}>. */}
      <a
        href={`#${MAIN_CONTENT_ID}`}
        onClick={skipToMain}
        className="sr-only rounded-lg bg-accent px-4 py-2 text-[14px] font-medium text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[60]"
      >
        본문 바로가기
      </a>
      <div ref={alignmentRef}>
        <div className={sidePadding}>
          <div className="flex h-16 items-center gap-3 md:h-auto md:py-5">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="메뉴"
              className="cursor-pointer text-[20px] leading-none text-ink md:hidden"
            >
              ☰
            </button>

            <Link
              to="/"
              className="shrink-0 font-bold text-accent text-[24px] leading-8 tracking-tight md:text-[22px]"
            >
              어디까지왔니
            </Link>

            <nav
              aria-label="주요 메뉴"
              className="hidden min-w-0 flex-1 items-center justify-center md:flex gap-[clamp(1rem,4vw,7rem)] px-[clamp(1rem,4vw,2rem)]"
            >
              {NAV_ITEMS.map((item) => {
                // 하위 경로(/courses/5)도 같은 메뉴 구간이다. 홈("/")은 모든 경로의 접두어라 정확히 같을 때만.
                const isActive =
                  item.to !== null &&
                  (normalizedPath === (item.to === "/" ? "" : item.to) ||
                    (item.to !== "/" && normalizedPath.startsWith(`${item.to}/`)));
                const isDisabled = item.to === null;

                if (isDisabled) {
                  return (
                    <span
                      key={item.label}
                      className="cursor-not-allowed whitespace-nowrap text-[16px] font-medium leading-8 text-caption opacity-50"
                    >
                      {item.label}
                    </span>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    to={item.to as string}
                    // 굵은 글씨만으로는 화면낭독기가 지금 페이지를 알 수 없다.
                    aria-current={isActive ? "page" : undefined}
                    className={`whitespace-nowrap text-[16px] leading-8 transition-colors ${
                      isActive ? "font-bold text-ink" : "font-medium text-ink/70 hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* CTA 공간을 유지해 코스 탐색에서도 메뉴 위치가 달라지지 않게 한다. */}
            <button
              type="button"
              onClick={() => navigate("/courses")}
              disabled={hideCourseCta}
              aria-hidden={hideCourseCta || undefined}
              tabIndex={hideCourseCta ? -1 : undefined}
              className={`ml-auto hidden shrink-0 cursor-pointer whitespace-nowrap rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent/90 md:block ${hideCourseCta ? "invisible" : ""}`}
            >
              코스 둘러보기
            </button>
          </div>
        </div>
      </div>

      {!isControlled && (
        <SidebarDrawer isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      )}
    </header>
  );
}
