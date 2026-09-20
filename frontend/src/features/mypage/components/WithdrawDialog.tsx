import { useRef, useState } from "react";
import { withdraw } from "../../auth";
import { HttpError, NetworkError } from "../../../lib/http";
import ModalDialog from "../../../components/common/ModalDialog";

interface Props {
  onClose: () => void;
  /** 탈퇴가 끝나면 부른다. 페이지가 안내 문구를 띄운다. */
  onWithdrawn: () => void;
}

function withdrawErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) return "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
  return "탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

/**
 * 회원 탈퇴 확인. 되돌릴 수 없는 일이라 무엇이 지워지는지 먼저 보여 주고, 취소에 초점을 둔다.
 * 지워지는 항목은 개인정보처리방침의 보유 기간(탈퇴 시까지)과 맞춘다.
 */
export default function WithdrawDialog({ onClose, onWithdrawn }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleWithdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      await withdraw();
      onWithdrawn();
    } catch (err) {
      // 401이면 useAuth가 로그아웃해 페이지가 로그인 안내로 바뀐다. 탈퇴 완료로 보이지 않게 onWithdrawn은 부르지 않는다.
      if (err instanceof HttpError && err.status === 401) return;
      setError(withdrawErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <ModalDialog title="정말 탈퇴할까요?" onClose={onClose} initialFocusRef={cancelRef} busy={busy}>
      <p className="text-[14px] leading-6 text-ink">탈퇴하면 아래 정보가 모두 지워지고 되돌릴 수 없어요.</p>
      <ul className="mt-3 list-disc space-y-1 rounded-[10px] bg-surface-muted py-3 pl-8 pr-4 text-[14px] leading-6 text-muted">
        <li>닉네임 등 회원 정보</li>
        <li>찜한 코스</li>
        <li>완주 기록과 기록 카드</li>
        <li>모은 스탬프</li>
      </ul>
      <p className="mt-3 text-[13px] leading-5 text-caption">카카오 계정과의 연결도 함께 끊어요.</p>

      {error && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <button
          ref={cancelRef}
          type="button"
          onClick={onClose}
          disabled={busy}
          className="h-11 flex-1 cursor-pointer rounded-lg border border-control-border text-[15px] font-bold text-ink hover:bg-control-hover disabled:cursor-default disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleWithdraw}
          disabled={busy}
          // 다른 화면에서 danger는 오류 글자·경고 배너 글자로만 쓰여, 채운 버튼 대신 흰 바탕에 글자·테두리로 맞춘다.
          className="h-11 flex-1 cursor-pointer rounded-lg border border-danger bg-white text-[15px] font-bold text-danger hover:bg-danger/5 disabled:cursor-default disabled:opacity-60"
        >
          {busy ? "처리 중…" : "탈퇴하기"}
        </button>
      </div>
    </ModalDialog>
  );
}
