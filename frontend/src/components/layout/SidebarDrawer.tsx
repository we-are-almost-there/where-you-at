import { Link, useLocation } from "react-router";
import { X } from "lucide-react";

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string; // 한글 라벨
  eyebrow: string; // 대문자 영문 라벨
  description: string; // hover 시 나타나는 짧은 설명
  to: string | null; // null이면 비활성화(준비중)
}

const NAV_ITEMS: NavItem[] = [
  { label: "홈", eyebrow: "HOME", description: "메인으로 돌아가기", to: null },
  { label: "코스 탐색", eyebrow: "COURSE", description: "걷기·자전거 코스 둘러보기", to: "/" },
  { label: "대회·이벤트", eyebrow: "EVENT", description: "가까운 대회 일정 확인", to: "/races" },
  { label: "지원금·환급", eyebrow: "SUPPORT", description: "지역별 여행 지원 혜택", to: "/support" },
];

export default function SidebarDrawer({ isOpen, onClose }: SidebarDrawerProps) {
  const location = useLocation();

  return (
    <>
      {/* 배경 딤 처리 — 순검정 대신 브랜드 잉크 톤 + 살짝 블러로 부드럽게 */}
      <div
        className={`fixed inset-0 z-40 bg-ink/30 backdrop-blur-[1px] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      {/* 드로어 본체 */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[320px] flex-col overflow-hidden bg-white transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 pt-6">
          <span className="text-[13px] font-semibold tracking-[0.15em] text-caption">
            WHERE YOU AT
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="cursor-pointer text-caption transition-colors hover:text-accent"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-6 pb-6 pt-6">
          <h2 className="text-[20px] font-bold leading-tight tracking-tight text-ink">
            어디까지왔니
          </h2>
          <p className="mt-1.5 text-[12px] leading-relaxed text-caption">
            인구감소지역과 함께 걷고 달리는 여행
          </p>
        </div>

        {/* 메뉴 — eyebrow와 한글 라벨을 같은 왼쪽 기준선에 맞춤(들여쓰기 제거).
          active 항목은 자신의 eyebrow 텍스트를 크게 확대한 워터마크가 배경에 은은하게 깔린다.
          글자 수에 따라 폰트 크기를 자동 조절해 짧은 라벨(EVENT)은 크게, 긴 라벨(SUPPORT)은
          폭 안에 맞게 살짝 작게 표시한다. 설명 문구는 모바일(터치 디바이스, hover 불가)에서는
          항상 펼쳐진 상태로 보이고, md 이상(마우스 환경)에서만 hover 시 펼쳐진다. 밑줄은
          평소엔 숨겨져 있다가 hover/active 시에만 나타난다(늘어나는 애니메이션 없음). */}
        <nav key={isOpen ? "open" : "closed"} className="relative flex-1 overflow-y-auto px-6">
          {NAV_ITEMS.map((item, i) => {
            const isActive = item.to !== null && location.pathname === item.to;
            const isDisabled = item.to === null;

            const rowContent = (
              <>
                {/* 배경 워터마크 — active일 때만, 자신의 eyebrow 텍스트를 크게 확대해 은은하게 */}
                {isActive && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 select-none whitespace-nowrap font-black uppercase leading-none tracking-tight text-accent/[0.08]"
                    style={{ fontSize: `clamp(30px, ${330 / item.eyebrow.length}px, 48px)` }}
                  >
                    {item.eyebrow}
                  </span>
                )}

                <div className="relative flex items-baseline gap-3">
                  <span
                    className={`text-[9px] font-semibold tracking-[0.15em] transition-colors duration-200 ${
                      isDisabled
                        ? "text-black/15"
                        : isActive
                          ? "text-accent"
                          : "text-accent/40 md:group-hover:text-accent/70"
                    }`}
                  >
                    {item.eyebrow}
                  </span>
                </div>

                <span
                  className={`relative mt-0.5 flex items-baseline gap-2 text-[15px] font-bold tracking-tight ${
                    isDisabled ? "text-black/20" : "text-ink"
                  }`}
                >
                  {item.label}
                  {isDisabled && (
                    <span className="text-[10px] font-medium tracking-normal text-caption">준비중</span>
                  )}
                </span>

                {/* 설명 — 모바일은 항상 펼침(grid-rows-[1fr] 고정), md+는 hover/active 시에만 펼침 */}
                {!isDisabled && (
                  <div
                    className={`grid grid-rows-[1fr] transition-[grid-template-rows] duration-300 ease-out md:grid-rows-[0fr] ${
                      isActive ? "md:grid-rows-[1fr]" : "md:group-hover:grid-rows-[1fr]"
                    }`}
                  >
                    <span
                      className={`overflow-hidden text-[12px] leading-relaxed text-caption opacity-100 transition-opacity delay-75 duration-200 md:opacity-0 ${
                        isActive ? "md:opacity-100" : "md:group-hover:opacity-100"
                      }`}
                    >
                      {item.description}
                    </span>
                  </div>
                )}

                {/* 밑줄 — 평소엔 투명, hover/active 시에만 나타남(위치·길이는 항상 고정) */}
                <span
                  className={`relative mt-2 block h-px bg-accent transition-opacity duration-200 ${
                    isActive ? "opacity-100" : isDisabled ? "opacity-0" : "opacity-0 md:group-hover:opacity-40"
                  }`}
                />
              </>
            );

            const rowClass =
              "group relative block overflow-hidden py-3 opacity-0 [animation-fill-mode:forwards]";
            const rowStyle = {
              animation: isOpen ? "sidebarFadeUp 0.5s cubic-bezier(0.22,1,0.36,1) forwards" : undefined,
              animationDelay: `${80 + i * 60}ms`,
            };

            return isDisabled ? (
              <div key={item.label} className={`${rowClass} cursor-not-allowed`} style={rowStyle}>
                {rowContent}
              </div>
            ) : (
              <Link
                key={item.label}
                to={item.to as string}
                onClick={onClose}
                className={rowClass}
                style={rowStyle}
              >
                {rowContent}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4">
          <div className="mb-2.5 h-px bg-divider" />
          <div className="flex items-center justify-between">
            <Link
              to="/help"
              onClick={onClose}
              className="text-[11px] text-caption transition-colors hover:text-accent"
            >
              고객지원
            </Link>
            <p className="text-[11px] tracking-wide text-caption">© 2026 WHERE YOU AT</p>
          </div>
        </div>
      </aside>
    </>
  );
}
