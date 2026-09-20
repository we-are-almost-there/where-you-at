import { useRef } from "react";
import ModalDialog from "../../components/common/ModalDialog";

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

const LINK_CLASS = "text-accent underline underline-offset-4";

// NewTabHint는 앞에 공백을 넣어 "이용약관 과"처럼 조사가 떨어져 보인다. 조사가 바로 붙는 문장이라 공백 없이 숨김 문구만 둔다.
const NEW_TAB = <span className="sr-only">(새 탭에서 열림)</span>;

/**
 * 카카오 로그인 전 나이 확인.
 *
 * 「개인정보 보호법」 제22조의2는 만 14세 미만 아동의 개인정보를 처리할 때 법정대리인 동의를 받도록 한다.
 * 법이 가입을 금지하는 것은 아니고, 서비스가 법정대리인 동의 절차를 두지 않아 만 14세 미만의 가입을 지원하지 않는 것이다.
 * 문구도 법이 금지하는 것처럼 쓰지 않고 서비스 정책으로 안내한다(개인정보처리방침 3번, 이용약관 제11조의2).
 * 나이를 실제로 확인할 방법이 없는 자기 확인이라 서버로 보내지 않는다.
 *
 * 되돌릴 수 있는 확인이라 초점은 확인 버튼에 둔다. 취소하면 로그인하지 않고 보던 화면에 머문다.
 * 약관·방침 링크는 새 탭으로 연다. 같은 탭에서 옮기면 로그인하려던 흐름이 끊긴다.
 */
export default function LoginAgeDialog({ onConfirm, onCancel }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <ModalDialog title="만 14세 이상만 가입할 수 있어요" onClose={onCancel} initialFocusRef={confirmRef}>
      <p className="break-keep text-[14px] leading-6 text-ink">
        카카오 로그인으로 가입하면 카카오 회원번호와 닉네임을 저장해요. 어디까지왔니는 법정대리인 동의 절차를 제공하지
        않아 만 14세 미만의 회원 가입을 지원하지 않아요.
      </p>
      <p className="mt-2 break-keep text-[13px] leading-5 text-muted">
        로그인하지 않아도 코스 탐색·따라가기, 대회 행사, 방문 혜택은 그대로 이용할 수 있어요.
      </p>
      <p className="mt-3 text-[13px] leading-5 text-caption">
        가입 전에{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
          이용약관
          {NEW_TAB}
        </a>
        과{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
          개인정보처리방침
          {NEW_TAB}
        </a>
        을 확인해 주세요.
      </p>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 flex-1 cursor-pointer rounded-lg border border-control-border text-[15px] font-bold text-ink hover:bg-control-hover"
        >
          취소
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={onConfirm}
          className="h-11 flex-1 cursor-pointer rounded-lg bg-accent text-[15px] font-bold text-white hover:bg-accent-strong"
        >
          만 14세 이상이에요
        </button>
      </div>
    </ModalDialog>
  );
}
