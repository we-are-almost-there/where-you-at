import { Link, useLocation } from "react-router";
import { Home, Route as RouteIcon, Trophy, MapPin, Gift, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  to: string | null; // null이면 비활성화(준비중)
  icon: LucideIcon;
}

interface NavSection {
  title: string | null; // null이면 섹션 제목 없이(예: 홈) 단독 표시
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [{ label: "홈", to: null, icon: Home }], // TODO: 홈 페이지 구현 후 연결
  },
  {
    title: "둘러보기",
    items: [
      { label: "코스 탐색", to: "/", icon: RouteIcon },
      { label: "대회·이벤트", to: "/races", icon: Trophy },
      { label: "주변 정보", to: null, icon: MapPin }, // TODO: 주변 정보 따로 뺄지 말지 고민
    ],
  },
  {
    title: "혜택",
    items: [{ label: "지원금·환급", to: "/support", icon: Gift }],
  },
];

export default function SidebarDrawer({ isOpen, onClose }: SidebarDrawerProps) {
  const location = useLocation();

  return (
    <>
      {/* 배경 딤 처리 */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      {/* 드로어 본체 - 왼쪽에서 슬라이드 인 */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[270px] bg-white shadow-xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-divider px-5 py-4">
          <span className="text-base font-bold text-ink">어디까지왔니</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="cursor-pointer text-caption"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        {NAV_SECTIONS.map((section, sectionIdx) => (
          <div key={section.title ?? `section-${sectionIdx}`}>
            {section.title && (
              <p className="px-5 pb-1.5 pt-3.5 text-[11px] font-semibold tracking-wide text-caption">
                {section.title}
              </p>
            )}
            <nav
              className={`flex flex-col ${
                sectionIdx < NAV_SECTIONS.length - 1 ? "border-b border-divider pb-2" : "pb-3.5"
              }`}
            >
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.to !== null && location.pathname === item.to;
                const isDisabled = item.to === null;

                if (isDisabled) {
                  return (
                    <span
                      key={item.label}
                      className="flex cursor-not-allowed items-center gap-3 px-5 py-2.5"
                    >
                      <Icon size={20} strokeWidth={1.75} className="text-caption opacity-50" />
                      <span className="text-sm text-caption">{item.label}</span>
                      <span className="ml-auto rounded-full border border-divider px-1.5 py-0.5 text-[10px] text-caption">
                        준비중
                      </span>
                    </span>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    to={item.to as string}
                    onClick={onClose}
                    className={`relative flex items-center gap-3 px-5 py-2.5 transition-colors ${
                      isActive ? "bg-lavender" : "hover:bg-lavender/40"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-accent" />
                    )}
                    <Icon
                      size={20}
                      strokeWidth={1.75}
                      className={isActive ? "text-accent" : "text-ink"}
                    />
                    <span
                      className={`text-sm ${
                        isActive ? "font-semibold text-accent" : "text-ink"
                      }`}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </aside>
    </>
  );
}