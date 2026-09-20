import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  title: string;
  titleAlign?: "left" | "center";
  onClose: () => void;
  /** 열릴 때 초점을 받을 요소. 없으면 닫기 버튼. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** 저장·탈퇴 요청이 진행 중이면 true. 닫기(Escape·배경·닫기 버튼)를 막아 결과를 놓치지 않게 한다. */
  busy?: boolean;
  /** sm: 확인·입력용(400px), lg: 지도처럼 넓은 내용(720px). 내용이 길면 본문만 스크롤한다. */
  size?: "sm" | "lg";
  children: ReactNode;
}

/**
 * 가운데에 띄우는 모달 대화상자 틀. 마이페이지(프로필 수정·탈퇴 확인·스탬프 지도)와 로그인 전 나이 확인이 쓴다.
 * 배경 잠금(스크롤·#root inert)과 초점 처리는 개인정보처리방침 팝업(help/PrivacyPolicyDialog)과 같다.
 * 닫힌 뒤에는 열 때 초점이 있던 버튼으로 돌려준다.
 */
export default function ModalDialog({ title, titleAlign = "left", onClose, initialFocusRef, busy = false, size = "sm", children }: Props) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  });

  const requestClose = () => {
    if (!busyRef.current) onCloseRef.current();
  };

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) onCloseRef.current();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    const root = document.getElementById("root");
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    if (root) root.inert = true;
    (initialFocusRef?.current ?? closeButtonRef.current)?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (root) root.inert = false;
      // 탈퇴 뒤처럼 연 버튼이 사라졌으면 돌려주지 않는다.
      if (opener?.isConnected) opener.focus();
    };
  }, [initialFocusRef]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-[18px] bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.2)] ${
          size === "lg" ? "max-w-[720px]" : "max-w-[400px]"
        }`}
      >
        <header className={`relative flex h-14 shrink-0 items-center gap-3 ${titleAlign === "center" ? "justify-center px-12" : "justify-between pl-5 pr-4"}`}>
          <h2 id={titleId} className={`text-[17px] font-bold text-ink ${titleAlign === "center" ? "text-center" : ""}`}>
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label="닫기"
            className={`cursor-pointer text-ink disabled:cursor-default disabled:opacity-40 ${titleAlign === "center" ? "absolute right-4 top-1/2 -translate-y-1/2" : ""}`}
          >
            <X size={22} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
