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
//
// nav ↔ 햄버거 전환 기준도 wide/compact가 서로 다르다. wide는 헤더가 화면 전체 폭을
// 쓰지만, compact(코스 탐색/코스 상세)는 헤더가 좌측 패널(전체 화면의 약 44~46%)
// 안에서만 렌더된다. 그래서 둘 다 같은 md(768px) "화면" 기준을 쓰면, compact는
// 실제 사용 가능한 폭이 그 절반도 안 되는데 화면은 768px를 넘었다고 판단해 nav를
// 보여주려다 잘린다(고객지원·CTA와 자전거 대여 항목이 겹침). 실측 결과 화면 폭
// 925px 근처가 경계였고, 여유를 둬 950px로 잡았다.
// (Tailwind JIT가 클래스를 정적으로 스캔하므로 두 브레이크포인트를 변수로 조합하지
// 않고 완전한 클래스 문자열을 그대로 삼항연산자에 넣는다)
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

  // 좌우 패딩: wide는 캐러셀과 같은 clamp 공식, compact(코스 탐색/코스 상세 좌측 패널)는
  // 화면 폭이 아니라 패널 폭(예: md:basis-[46%])만큼만 실제로 쓸 수 있어서 vw 기반 clamp가
  // 잘 안 맞는다(패널이 좁아도 vw는 전체 화면 기준이라 여유가 과하게 잡힘) — 그냥 작은 고정값
  const sidePadding = isWide
    ? "px-[clamp(1rem,6vw,8rem)]"
    : "px-3";

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
            className={`cursor-pointer text-[20px] leading-none text-ink ${
              isWide ? "md:hidden" : "min-[950px]:hidden"
            }`}
          >
            ☰
          </button>

          <Link
            to="/"
            className="shrink-0 font-bold text-accent text-[22px] tracking-tight md:text-[20px]"
          >
            어디까지왔니
          </Link>

          {/* 로고-nav 간격·아이템 간격 모두 고정값 대신 반응형으로. wide는 화면 폭 기준 clamp로
            같이 부드럽게 줄어들게 하고, compact(코스 탐색/코스 상세 좌측 패널)는 패널 폭이 화면의
            절반 이하라 vw 기준 clamp를 쓰면 여유가 과하게 잡혀 nav가 잘렸다 — 작은 고정값(ml-4,
            gap도 더 좁은 clamp)으로 별도 처리. nav↔햄버거 전환 시점도 위 이유로 wide/compact가
            다르다(md vs min-[950px], 실측 기준) */}
          <nav
            className={`hidden min-w-0 flex-1 items-center gap-[clamp(0.5rem,1.5vw,1.5rem)] ${
              isWide
                ? "md:flex ml-[clamp(1rem,4vw,4rem)]"
                : "min-[950px]:flex ml-4"
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
