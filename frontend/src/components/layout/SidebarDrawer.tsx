import { Link, useLocation } from "react-router";
import { Home, Route as RouteIcon, Trophy, MapPin, Gift, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  to: string | null;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: "홈", to: null, icon: Home },
  { label: "코스 탐색", to: "/", icon: RouteIcon },
  { label: "주변 정보", to: null, icon: MapPin },
  { label: "대회·이벤트", to: "/races", icon: Trophy },
  { label: "지원금·환급", to: "/support", icon: Gift },
];

export default function SidebarDrawer({ isOpen, onClose }: SidebarDrawerProps) {
  const location = useLocation();

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col bg-white shadow-[8px_0px_28px_0px_rgba(17,17,17,0.12)] transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-6">
          <span className="text-[16px] font-bold text-ink">어디까지왔니</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="cursor-pointer rounded-full p-1 text-caption hover:bg-black/[0.04] hover:text-ink"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        <p className="px-5 pb-5 text-[12px] leading-relaxed text-caption">
          인구감소지역과 함께 걷고 달리는 여행
        </p>

        {/* 트레일 형태 리스트 — 왼쪽 세로 점선이 각 지점을 코스처럼 연결 */}
        <nav className="relative pb-4 pl-8 pr-4 pt-3">
          <span
            className="absolute left-[27px] top-3 bottom-4 w-px"
            style={{
              backgroundImage: "linear-gradient(to bottom, #C4BAFA 50%, transparent 50%)",
              backgroundSize: "1px 8px",
            }}
            aria-hidden
          />
          {/* 출발 지점 마커 — 첫 항목("홈") 바로 위, KakaoMap 초록 점과 톤 통일 */}
          <span className="absolute left-[27px] top-1 grid size-[14px] -translate-x-1/2 place-items-center rounded-full border-2 border-white bg-[#03C75A] shadow-[0_1px_3px_rgba(0,0,0,0.3)]" />
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.to !== null && location.pathname === item.to;
            const isDisabled = item.to === null;

            const dot = (
              <span
                className={`absolute left-0 top-1/2 grid size-[26px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 ${
                  isActive
                    ? "border-accent bg-accent text-white"
                    : isDisabled
                      ? "border-divider bg-white text-caption"
                      : "border-accent/40 bg-white text-accent"
                }`}
              >
                <Icon size={13} strokeWidth={2} />
              </span>
            );

            if (isDisabled) {
              return (
                <span
                  key={item.label}
                  className="relative flex cursor-not-allowed items-center gap-3 py-3.5 pl-5"
                >
                  {dot}
                  <span className="text-[14px] text-caption">{item.label}</span>
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
                className="relative flex items-center gap-3 py-3.5 pl-5"
              >
                {dot}
                <span className={`text-[14px] ${isActive ? "font-semibold text-accent" : "text-ink"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
          {/* 도착 지점 마커 */}
          <span className="absolute left-[27px] bottom-0 grid size-[14px] -translate-x-1/2 place-items-center rounded-full border-2 border-white bg-[#FF4D4F] shadow-[0_1px_3px_rgba(0,0,0,0.3)]" />
        </nav>

        <div className="mt-auto border-t border-divider px-5 py-3.5">
          <p className="text-[11px] text-caption">어디까지왔니 · 2026</p>
        </div>
      </aside>
    </>
  );
}
