import { useState, type ReactNode } from "react";
import { startKakaoLogin } from "./kakaoRedirect";
import LoginAgeDialog from "./LoginAgeDialog";

/**
 * 로그인 버튼용. 로그인할 때마다 만 14세 이상인지 먼저 묻고, 확인하면 카카오 로그인으로 보낸다.
 * 확인 기록을 기기에 남기지 않는다. 남기면 공용 기기에서 한 사람이 확인한 뒤 다음 사람은 질문을 받지 않는다.
 * 반환한 dialog를 화면 어딘가에 그려야 한다(포털이라 위치는 상관없다).
 *
 * 로그인을 시작하는 버튼은 모두 startKakaoLogin 대신 이 훅을 쓴다(마이페이지 로그인 안내, 상단바 로그인 버튼).
 * 로그인 실패 뒤의 다시 시도(KakaoCallback)는 이미 확인을 거친 흐름이라 바로 보낸다.
 */
export function useKakaoLogin(): { login: (returnTo: string) => void; dialog: ReactNode } {
  const [pendingReturnTo, setPendingReturnTo] = useState<string | null>(null);

  const login = (returnTo: string) => setPendingReturnTo(returnTo);

  const dialog =
    pendingReturnTo === null ? null : (
      <LoginAgeDialog
        onCancel={() => setPendingReturnTo(null)}
        onConfirm={() => startKakaoLogin(pendingReturnTo)}
      />
    );

  return { login, dialog };
}
