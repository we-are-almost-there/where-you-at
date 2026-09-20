import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router";
import { UserRound, X } from "lucide-react";
import { useAuth, useKakaoLogin } from "../../features/auth";
import SidebarAccount from "./SidebarAccount";
import logoUrl from "../../assets/logo.svg";

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** 모달이 떠 있는 동안 드로어를 비활성화한다. */
  inert?: boolean;
}

interface NavItem {
  label: string; // 한글 라벨
  eyebrow: string; // 대문자 영문 라벨
  description: string; // 마우스를 올리면 나타나는 짧은 설명
  to: string | null; // null이면 비활성화(준비중)
}

const NAV_ITEMS: NavItem[] = [
  { label: "홈", eyebrow: "HOME", description: "홈으로 이동", to: "/" },
  { label: "코스 탐색", eyebrow: "COURSE", description: "걷기·자전거 코스 둘러보기", to: "/courses" },
  { label: "대회 행사", eyebrow: "EVENT", description: "가까운 대회 일정 확인", to: "/races" },
  { label: "방문 혜택", eyebrow: "SUPPORT", description: "지역별 방문 혜택 확인", to: "/support" },
  { label: "자전거 대여", eyebrow: "RENTAL", description: "인근 자전거 대여소 찾기", to: "/bicycle-facilities" },
];

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export default function SidebarDrawer({ isOpen, onClose, inert }: SidebarDrawerProps) {
  const location = useLocation();
  const auth = useAuth();
  const { login, dialog: loginDialog } = useKakaoLogin();
  const shouldBeInert = !isOpen || Boolean(inert) || Boolean(loginDialog);
  const asideRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // 드로어는 body에 두고 상단바와 본문을 포함한 앱 전체를 잠근다.
  // 포커스를 복귀시키는 effect보다 먼저 잠금을 해제한다.
  useLayoutEffect(() => {
    if (shouldBeInert) return;
    const root = document.getElementById("root");
    if (!root) return;
    const wasInert = root.hasAttribute("inert");
    root.setAttribute("inert", "");
    return () => {
      if (!wasInert) root.removeAttribute("inert");
    };
  }, [shouldBeInert]);

  // 로그인 모달의 잠금 해제가 끝난 뒤에도 열린 드로어의 배경 잠금을 유지한다.
  useEffect(() => {
    if (!shouldBeInert) document.getElementById("root")?.setAttribute("inert", "");
  }, [shouldBeInert]);

  // 열리는 시점의 포커스를 저장해뒀다가, 완전히 닫힐 때 원래 위치로 복귀시킨다.
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    return () => {
      const previous = previouslyFocusedRef.current;
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);

  // 드로어가 실제로 활성화될 때(열려 있고 inert가 아닐 때) 내부로 포커스를 이동시킨다.
  useEffect(() => {
    if (shouldBeInert) return;
    closeButtonRef.current?.focus();
  }, [shouldBeInert]);

  // 열려 있는 동안 탭 키로 이동하는 포커스를 드로어 내부에 가둔다.
  useEffect(() => {
    if (shouldBeInert) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = asideRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (!asideRef.current?.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // 먼저 열린 배경 팝업의 document 버블 핸들러보다 먼저 Escape를 처리한다.
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [shouldBeInert, onClose]);

  return createPortal(
    <>
      {/* 배경 딤 처리 — 순검정 대신 브랜드 잉크 톤 + 살짝 블러로 부드럽게. */}
      <div
        className={`fixed inset-0 z-50 w-screen bg-ink/30 backdrop-blur-[1px] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        inert={shouldBeInert}
      />

      {/* 드로어 본체 */}
      <aside
        ref={asideRef}
        role="dialog"
        aria-modal={shouldBeInert ? undefined : true}
        aria-label="메뉴"
        aria-hidden={shouldBeInert || undefined}
        className={`fixed inset-y-0 left-0 z-[51] flex w-[360px] max-w-[calc(100vw-24px)] flex-col overflow-hidden bg-white transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        inert={shouldBeInert}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-8">
          <h2>
            <img src={logoUrl} alt="어디까지왔니" className="h-9 w-auto" />
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="cursor-pointer text-caption transition-colors hover:text-accent"
          >
            <X size={24} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-6 pb-6 pt-3">
          <p className="text-[12px] leading-relaxed text-caption">
            전국의 코스와 지역의 방문 혜택을 잇는 액티비티 여행
          </p>
        </div>

        <div className="px-6 pb-4">
          {auth.status === "loading" ? (
            <div role="status" className="flex h-[140px] items-center justify-center rounded-2xl bg-lavender/40 text-[13px] text-caption">로그인 정보를 확인하고 있어요…</div>
          ) : auth.status === "signedIn" ? (
            isOpen && <SidebarAccount key={`${auth.user.id}:${auth.user.nickname}`} user={auth.user} onClose={onClose} />
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-2xl border border-accent/15 p-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-lavender text-accent"><UserRound size={22} aria-hidden="true" /></span>
                <div>
                  <p className="text-[16px] font-bold text-ink">로그인이 필요해요</p>
                  <p className="text-[12px] text-caption">찜·기록·스탬프를 저장할 수 있어요</p>
                </div>
              </div>
              <button type="button" onClick={() => login(location.pathname + location.search)} className="mt-2.5 min-h-11 w-full cursor-pointer rounded-xl bg-accent px-3 py-3 text-[16px] font-bold text-white hover:bg-accent/90">카카오로 3초 만에 시작</button>
            </>
          )}
        </div>

        {/* 메뉴 — eyebrow와 한글 라벨을 같은 왼쪽 기준선에 맞춤(들여쓰기 제거).
          active 항목은 자신의 eyebrow 텍스트를 크게 확대한 워터마크가 배경에 은은하게 깔린다.
          글자 수에 따라 폰트 크기를 자동 조절해 짧은 라벨(EVENT)은 크게, 긴 라벨(SUPPORT)은
          폭 안에 맞게 살짝 작게 표시한다. 설명 문구는 모바일(터치 디바이스, hover 불가)에서는
          항상 펼쳐진 상태로 보이고, md 이상(마우스 환경)에서만 hover 시 펼쳐진다. 밑줄은
          평소엔 숨겨져 있다가 마우스를 올리거나 활성화되면 나타난다(늘어나는 애니메이션 없음). */}
        <nav key={isOpen ? "open" : "closed"} className="relative px-6">
          {NAV_ITEMS.map((item, i) => {
            const isActive = item.to !== null && (location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(`${item.to}/`)));
            const isDisabled = item.to === null;

            const rowContent = (
              <>
                {/* 배경 워터마크 — 활성화됐을 때만 영문 라벨을 크게 확대해 은은하게 */}
                {isActive && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 select-none whitespace-nowrap font-black uppercase leading-none tracking-tight text-accent/[0.08]"
                    style={{ fontSize: `clamp(30px, ${350 / item.eyebrow.length}px, 56px)` }}
                  >
                    {item.eyebrow}
                  </span>
                )}

                <div className="relative flex items-baseline gap-3">
                  <span
                    className={`text-[10px] font-semibold tracking-[0.15em] transition-colors duration-200 ${
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
                  className={`relative mt-0.5 flex items-baseline gap-2 text-[17px] font-bold tracking-tight ${
                    isDisabled ? "text-black/20" : "text-ink"
                  }`}
                >
                  {item.label}
                  {isDisabled && (
                    <span className="text-[10px] font-medium tracking-normal text-caption">준비중</span>
                  )}
                </span>

                {/* 설명 — 모바일은 항상 펼침(grid-rows-[1fr] 고정), 중간 화면 이상에서는 마우스를 올리거나 활성화되면 펼침 */}
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

                {/* 밑줄 — 평소엔 투명, 마우스를 올리거나 활성화되면 나타남(위치·길이는 항상 고정) */}
                <span
                  className={`relative mt-2 block h-px bg-divider transition-opacity duration-200 ${
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
                aria-current={isActive ? "page" : undefined}
                onClick={onClose}
                className={rowClass}
                style={rowStyle}
              >
                {rowContent}
              </Link>
            );
          })}
        </nav>
        </div>

        <div className="shrink-0 border-t border-divider px-6 py-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] tracking-wide text-caption">Copyright © 2026 거의 다왔어</p>
          </div>
        </div>
      </aside>
      {loginDialog}
    </>,
    document.body,
  );
}
