import { useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import SidebarDrawer from "./SidebarDrawer";

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
  const hideCourseCta = location.pathname.replace(/\/+$/, "") === "/courses";
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
              className="hidden min-w-0 flex-1 items-center justify-center md:flex gap-[clamp(1rem,4vw,7rem)] px-[clamp(1rem,4vw,2rem)]"
            >
              {NAV_ITEMS.map((item) => {
                const isActive = item.to !== null && location.pathname === item.to;
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
