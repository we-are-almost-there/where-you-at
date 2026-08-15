import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import SidebarDrawer from "./SidebarDrawer";

interface NavItem {
  label: string;
  to: string | null;
}

const NAV_ITEMS: NavItem[] = [
  { label: "홈", to: null },
  { label: "코스 탐색", to: "/" },
  { label: "대회·이벤트", to: "/races" },
  { label: "지원금·환급", to: "/support" },
];

interface Props {
  variant?: "wide" | "compact";
}

export default function AppHeader({ variant = "compact" }: Props) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
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
          onClick={() => setIsMobileSidebarOpen(true)}
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

      <SidebarDrawer isOpen={isMobileSidebarOpen} onClose={() => setIsMobileSidebarOpen(false)} />
    </header>
  );
}
