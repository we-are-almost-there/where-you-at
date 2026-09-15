import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { MapPin } from "lucide-react";

interface Props {
  onAllow: () => void;
  onDecline: () => void;
}

export default function LocationConsentDialog({ onAllow, onDecline }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.getElementById("root");
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const declineOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDecline();
    };

    document.body.style.overflow = "hidden";
    if (root) root.inert = true;
    dialogRef.current?.focus();
    document.addEventListener("keydown", declineOnEscape);

    return () => {
      document.removeEventListener("keydown", declineOnEscape);
      document.body.style.overflow = previousOverflow;
      if (root) root.inert = false;
      previousFocus?.focus();
    };
  }, [onDecline]);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-full max-w-[420px] rounded-[18px] bg-white px-5 py-6 text-center shadow-[0px_8px_24px_0px_rgba(0,0,0,0.2)] outline-none md:px-7 md:py-7"
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-lavender">
          <MapPin className="size-7 text-accent" aria-hidden="true" />
        </div>
        <h2 id={titleId} className="mt-4 text-[19px] font-bold text-ink">
          현재 위치를 사용해도 될까요?
        </h2>
        <div
          id={descriptionId}
          className="mt-3 flex flex-col gap-2 break-keep text-[14px] leading-relaxed text-caption"
        >
          <p>가까운 코스와 자전거 대여소를 찾고 코스를 따라갈 때 현재 위치를 사용해요.</p>
          <p>위치 기반 계산은 기기 안에서 하며 현재 위치를 운영팀 서버로 전송하거나 저장하지 않아요.</p>
          <p>동의하지 않아도 기본 순서로 다른 기능을 이용할 수 있어요.</p>
        </div>
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-[13px] text-caption underline decoration-caption/40 underline-offset-4 transition-colors hover:text-ink"
        >
          개인정보처리방침 보기
        </a>
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onAllow}
            className="h-12 w-full cursor-pointer rounded-xl bg-accent text-[15px] font-bold text-white transition-colors hover:bg-accent/90"
          >
            동의하고 위치 사용
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="h-12 w-full cursor-pointer rounded-xl border border-divider text-[15px] text-ink transition-colors hover:bg-surface-hover"
          >
            동의하지 않음
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
