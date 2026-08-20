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
  // 아직 라우트 없음(자전거 대여소 기능 미구현) — to: null이면 비활성 처리됨
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

// 좌우 여백·로고-nav 간격·nav 아이템 간격을 전부 고정 px(md:px-32 등)가 아니라
// clamp()로 화면 폭에 비례하게 둔다. 이전엔 md 기준으로 값이 뚝 끊겨 있어서
// 창을 줄이면 로고(왼쪽)는 늘 같은 자리에 못박혀 있고, 오른쪽 CTA·고객지원만
// ml-auto/justify-end 때문에 홀로 눌리며 움직이는 것처럼 보였다. clamp로
// 바꾸면 좌우 여백과 내부 간격이 폭에 맞춰 다 같이 부드럽게 줄어든다.
// wide(코스 탐색 제외 전 페이지)는 최대 여백을 넉넉하게, compact(코스 탐색,
// 지도가 폭을 많이 써야 함)는 최대 여백을 좁게 잡는다.
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

  // 좌우 패딩: 화면이 넓을수록 최대 8rem(wide)/2rem(compact)까지, 좁아지면 최소 1rem까지
  const sidePadding = isWide
    ? "px-[clamp(1rem,6vw,8rem)]"
    : "px-[clamp(1rem,3vw,2rem)]";

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-divider bg-white">
      <div className={sidePadding}>
        <div className="hidden justify-end gap-4 pt-1.5 text-[11px] text-caption md:flex">
          <Link to="/help" className="cursor-pointer hover:text-ink">
            고객지원
          </Link>
        </div>

        <div className="flex h-14 items-center gap-3 md:h-auto md:pb-3.5 md:pt-2.5">
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
            className="shrink-0 font-bold text-accent text-[22px] tracking-tight md:text-[20px]"
          >
            어디까지왔니
          </Link>

          {/* 로고-nav 간격도 고정(ml-16/ml-8) 대신 clamp로. nav 아이템 간격(gap)도
            동일하게 폭에 비례해 줄어들어 CTA와 같은 리듬으로 움직인다 */}
          <nav
            className={`hidden min-w-0 flex-1 items-center gap-[clamp(0.75rem,2vw,2rem)] md:flex ${
              isWide
                ? "ml-[clamp(1rem,4vw,4rem)]"
                : "ml-[clamp(0.75rem,2vw,2rem)]"
            }`}
          >
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
              onClick={() => navigate("/courses")}
              className="ml-auto hidden shrink-0 cursor-pointer whitespace-nowrap rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent/90 md:block"
            >
              코스 둘러보기
            </button>
          )}
        </div>
      </div>

      {!isControlled && (
        <SidebarDrawer isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      )}
    </header>
  );
}
