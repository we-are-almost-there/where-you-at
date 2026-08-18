import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import SidebarDrawer from "./SidebarDrawer";

interface NavItem {
  label: string;
  to: string | null;
}

const NAV_ITEMS: NavItem[] = [
  { label: "홈", to: "/" },
  { label: "코스 탐색", to: "/courses" },
  { label: "대회 행사", to: "/races" },
  { label: "방문 혜택", to: "/support" },
  { label: "자전거 대여", to: null },
];

interface BaseProps {
  variant?: "wide" | "compact";
}

// 이 페이지가 이미 자체 SidebarDrawer를 렌더링하고 있으면(예: CourseDetail의
// 모바일 지도 위 플로팅 메뉴 버튼) 이 두 prop을 넘겨 상태를 공유시킨다.
// 넘기면 AppHeader는 자신의 <SidebarDrawer>를 렌더링하지 않고 햄버거 클릭도
// 이 핸들러로 위임한다(제어형). 안 넘기면 기존처럼 내부에서 알아서 연다(비제어형).
// 유니온으로 묶은 이유: 하나만 넘기는 실수(예: isSidebarOpen만 넘기고
// onSidebarOpenChange 누락)를 컴파일 타임에 막기 위함
type ControlledSidebarProps =
  | { isSidebarOpen?: undefined; onSidebarOpenChange?: undefined }
  | { isSidebarOpen: boolean; onSidebarOpenChange: (open: boolean) => void };

type Props = BaseProps & ControlledSidebarProps;

export default function AppHeader({
  variant = "compact",
  isSidebarOpen: controlledOpen,
  onSidebarOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isSidebarOpen = isControlled ? controlledOpen : internalOpen;
  const setIsSidebarOpen = isControlled ? onSidebarOpenChange : setInternalOpen;

  const location = useLocation();
  const navigate = useNavigate();
  const isWide = variant === "wide";

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-divider bg-white">
      <div
        className={`hidden justify-end gap-4 px-4 pt-1.5 text-[11px] text-caption md:flex ${
          isWide ? "md:px-32" : "md:px-4"
        }`}
      >
        <Link to="/help" className="cursor-pointer hover:text-ink">
          고객지원
        </Link>
      </div>

      <div
        className={`flex h-14 items-center gap-3 px-4 md:h-auto md:pb-3.5 md:pt-2.5 ${
          isWide ? "md:px-32" : "md:px-4"
        }`}
      >
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          aria-label="메뉴"
          className="cursor-pointer text-[20px] leading-none text-ink md:hidden"
        >
          ☰
        </button>

        <Link to="/" className="shrink-0 font-bold text-accent text-[22px] tracking-tight md:text-[20px]">
          어디까지왔니
        </Link>

        <nav className={`hidden items-center gap-8 md:flex ${isWide ? "ml-16" : "ml-8"}`}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.to !== null && location.pathname === item.to;
            const isDisabled = item.to === null;

            if (isDisabled) {
              return (
                <span
                  key={item.label}
                  className="cursor-not-allowed whitespace-nowrap text-[14px] text-caption opacity-50"
                >
                  {item.label}
                </span>
              );
            }

            return (
              <Link
                key={item.label}
                to={item.to as string}
                className={`whitespace-nowrap text-[14px] transition-colors ${
                  isActive ? "font-bold text-ink" : "text-ink/70 hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {isWide && (
          <button
            type="button"
            onClick={() => navigate("/")}
            className="ml-auto hidden cursor-pointer whitespace-nowrap rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent/90 md:block"
          >
            코스 둘러보기
          </button>
        )}
      </div>

      {!isControlled && (
        <SidebarDrawer isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      )}
    </header>
  );
}
