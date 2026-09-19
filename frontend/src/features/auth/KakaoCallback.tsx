import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { LoaderCircle } from "lucide-react";
import AppHeader from "../../components/layout/AppHeader";
import { MAIN_CONTENT_ID } from "../../components/layout/mainContent";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { ErrorNotice } from "../../components/error/ErrorNotice";
import { toUserError, type UserError } from "../../components/error/userError";
import { HttpError } from "../../lib/http";
import { loginWithKakao } from "./authApi";
import { clearLoginAttempt, readLoginAttempt, startKakaoLogin } from "./kakaoRedirect";
import { signIn } from "./useAuth";

const LOGIN_FAILED_TITLE = "로그인하지 못했어요";
const INVALID_ATTEMPT_ERROR: UserError = {
  title: "로그인 요청을 확인하지 못했어요",
  description: "처음부터 다시 로그인해 주세요.",
};
const EXPIRED_ERROR: UserError = {
  title: "로그인 요청이 만료되었어요",
  description: "다시 로그인해 주세요.",
};
const TOO_MANY_ATTEMPTS_ERROR: UserError = {
  title: "로그인을 너무 자주 시도했어요",
  description: "잠시 후 다시 시도해 주세요.",
};

function toLoginError(err: unknown): UserError {
  if (err instanceof HttpError) {
    if (err.status === 401) return EXPIRED_ERROR;
    // 서버가 같은 IP에서 온 반복 요청을 막은 경우다. 한도는 서버가 정한다.
    if (err.status === 429) return TOO_MANY_ATTEMPTS_ERROR;
  }
  return toUserError(err, LOGIN_FAILED_TITLE);
}

/** 카카오 인가 뒤 돌아오는 페이지. 인가 코드를 우리 토큰으로 바꾸고 원래 보던 페이지로 보낸다. */
export default function KakaoCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // 렌더링 중에는 읽기만 하고, 지우는 일은 effect에서 한다.
  const [attempt] = useState(readLoginAttempt);
  const [error, setError] = useState<UserError | null>(null);
  const startedRef = useRef(false);
  useDocumentTitle("카카오 로그인");

  const code = params.get("code");
  // 동의 화면에서 취소하면 code 대신 error=access_denied가 온다.
  const cancelled = params.get("error") !== null;
  const valid = attempt !== null && code !== null && params.get("state") === attempt.state;
  const returnTo = attempt?.returnTo ?? "/";

  useEffect(() => {
    // 개발 모드의 StrictMode는 effect를 두 번 실행한다. 인가 코드는 한 번만 쓸 수 있어
    // 두 번째 교환이 실패하고 오류 화면이 뜨므로, 한 번만 실행되게 막는다.
    if (startedRef.current) return;
    startedRef.current = true;
    clearLoginAttempt();

    if (cancelled) {
      navigate(returnTo, { replace: true });
      return;
    }
    if (!valid) return;

    loginWithKakao(code).then(
      ({ access_token, user }) => {
        signIn(access_token, user);
        navigate(returnTo, { replace: true });
      },
      (err: unknown) => {
        setError(toLoginError(err));
      },
    );
  }, [cancelled, code, navigate, returnTo, valid]);

  const shownError = cancelled ? null : valid ? error : INVALID_ATTEMPT_ERROR;

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <AppHeader />

      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="flex flex-1 flex-col items-center justify-center px-4 py-12 outline-none"
      >
        {/* 화면에 큰 제목이 없어 화면낭독기용 페이지 제목만 둔다 */}
        <h1 className="sr-only">카카오 로그인</h1>
        {shownError ? (
          <ErrorNotice
            title={shownError.title}
            description={shownError.description}
            onRetry={() => startKakaoLogin(returnTo)}
          />
        ) : (
          <div role="status" className="flex flex-col items-center text-center">
            <LoaderCircle className="size-8 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />
            <p className="mt-4 text-[17px] font-bold text-ink">로그인하는 중이에요</p>
            {/* 서버가 잠들어 있으면 첫 요청이 오래 걸릴 수 있어 기다려 달라고 안내한다. */}
            <p className="mt-2 text-[14px] text-muted">잠시만 기다려 주세요.</p>
          </div>
        )}
      </main>
    </div>
  );
}
