import { useEffect, useId, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import PrivacyPolicyContent from "./PrivacyPolicyContent";

interface Props {
  onClose: () => void;
  /** 닫은 뒤 포커스를 돌려줄 요소. 보통 팝업을 연 버튼이다. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * 개인정보처리방침 팝업. 1:1 문의 동의 안내에서 연다.
 * 페이지로 이동하면 적어 둔 문의가 사라지므로, 같은 화면 위에 띄워 읽고 닫으면 이어서 쓸 수 있게 한다.
 *
 * 화면 폭과 상관없이 가운데 카드로 띄우고, 본문이 길면 카드 안에서만 스크롤한다.
 * 배경·모서리·그림자는 코스 상세의 "코스에서 조금 먼 것 같아요" 팝업과 같다.
 */
export default function PrivacyPolicyDialog({ onClose, returnFocusRef }: Props) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // 팝업은 할 수 있는 일이 읽고 닫기뿐이라 Escape로도 닫는다.
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  // 떠 있는 동안 뒤쪽 화면을 잠근다.
  // - 스크롤: 팝업 본문과 뒤 페이지가 함께 스크롤되지 않게 한다. DocumentPage가 scrollbar-gutter: stable을
  //   켜 두어 스크롤바 자리가 유지되므로 잠가도 본문이 옆으로 흔들리지 않는다.
  // - 포커스: aria-modal은 Tab 이동을 막아 주지 않아서, 앱 전체(#root)를 inert로 만든다.
  //   팝업은 #root 밖(body)에 포털로 그려서 함께 잠기지 않는다.
  // 포커스는 autoFocus가 아니라 여기서 옮긴다. 개발 모드(StrictMode)는 이펙트를 한 번 정리했다가 다시 실행하는데,
  // 그 사이 포커스가 뒤쪽 버튼으로 돌아갔다가 inert에 막혀 사라진다. autoFocus는 다시 실행되지 않는다.
  useEffect(() => {
    const root = document.getElementById("root");
    const returnTarget = returnFocusRef?.current;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    if (root) root.inert = true;
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (root) root.inert = false;
      // inert를 푼 뒤에 옮겨야 포커스가 들어간다.
      returnTarget?.focus();
    };
  }, [returnFocusRef]);

  return createPortal(
    // 바깥 어두운 영역을 누르면 닫는다. 카드 안을 누른 경우(target이 배경이 아님)는 무시한다.
    // 키보드 사용자는 Escape와 닫기 버튼으로 닫을 수 있어 배경 클릭은 마우스용 보조 수단이다.
    <div
      // px-6: 좁은 화면에서도 카드 양옆에 어두운 배경이 보여 팝업임을 알 수 있게 한다 (코스 상세 안내 팝업과 같은 여백).
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // overflow-hidden: 본문 스크롤바가 둥근 모서리 밖으로 삐져나오지 않게 한다.
        className="flex max-h-[80dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-[18px] bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.2)]"
      >
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 pl-5 pr-4">
          <h2 id={titleId} className="text-[17px] font-bold text-ink">
            개인정보처리방침
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="cursor-pointer text-ink"
          >
            <X size={22} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>
        {/* overscroll-contain: 본문 끝까지 스크롤한 뒤 계속 굴려도 뒤 페이지로 스크롤이 넘어가지 않게 한다. */}
        {/* 제목과 본문 사이 구분선이 없어 위 여백(pt-1)은 좁게 두고, 제목 줄 높이(h-14)가 간격을 대신한다. */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-1">
          <PrivacyPolicyContent />
        </div>
      </div>
    </div>,
    document.body,
  );
}
