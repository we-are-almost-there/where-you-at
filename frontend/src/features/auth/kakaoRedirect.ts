// 카카오 인가 페이지로 보내고, 돌아왔을 때 우리가 보낸 요청인지 확인하는 코드.
//
// state: 다른 사이트가 자기 인가 코드로 우리 콜백을 열게 하는 공격(로그인 CSRF)을 막는다.
//   보낼 때 sessionStorage에 저장하고, 돌아온 주소의 state와 같을 때만 로그인한다.
// returnTo: 로그인 뒤 돌아갈 경로. 같은 탭 안에서만 쓰므로 sessionStorage에 둔다.

export const KAKAO_CALLBACK_PATH = "/auth/kakao/callback";

const AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const STORAGE_KEY = "auth.kakaoLogin";

export interface LoginAttempt {
  state: string;
  returnTo: string;
}

/**
 * 카카오 인가 페이지로 이동한다.
 *
 * redirect_uri는 백엔드 KAKAO_LOGIN_REDIRECT_URI, 카카오 콘솔에 등록한 값과 한 글자도 달라서는 안 된다.
 * 다르면 인가 단계(KOE006)나 토큰 교환 단계(KOE303)에서 실패한다.
 */
export function startKakaoLogin(returnTo: string): void {
  window.location.assign(prepareKakaoLogin(returnTo));
}

/** 로그인 시도를 저장하고 카카오 인가 주소를 돌려준다. 페이지 이동과 분리해 테스트할 수 있게 했다. */
export function prepareKakaoLogin(returnTo: string): string {
  const state = randomState();
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ state, returnTo } satisfies LoginAttempt));
  } catch {
    // 저장하지 못하면 콜백에서 state를 확인할 수 없어 로그인이 실패로 안내된다.
  }

  const params = new URLSearchParams({
    // 로그인 전용 카카오 앱의 REST API 키. 주소창에 드러나는 값이다.
    client_id: import.meta.env.VITE_KAKAO_LOGIN_CLIENT_ID ?? "",
    redirect_uri: `${window.location.origin}${KAKAO_CALLBACK_PATH}`,
    response_type: "code",
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

/** 저장해 둔 로그인 시도를 읽는다. 없거나 형식이 다르면 null. 부수효과가 없어 렌더링 중에 불러도 된다. */
export function readLoginAttempt(): LoginAttempt | null {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (!isLoginAttempt(parsed)) return null;
    return { state: parsed.state, returnTo: safeReturnTo(parsed.returnTo) };
  } catch {
    return null;
  }
}

/** 로그인 시도는 한 번만 쓴다. 콜백을 새로고침하거나 뒤로 가기로 다시 열어도 재사용되지 않게 지운다. */
export function clearLoginAttempt(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 읽을 수도 없는 상태라 무시한다.
  }
}

// crypto.randomUUID는 HTTPS나 localhost에서만 있어, 휴대폰으로 http://192.168.x.x에 접속해 테스트하면
// 로그인 버튼에서 오류가 난다. getRandomValues는 어디서나 동작한다.
function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isLoginAttempt(value: unknown): value is LoginAttempt {
  if (typeof value !== "object" || value === null) return false;
  const { state, returnTo } = value as Record<string, unknown>;
  return typeof state === "string" && state !== "" && typeof returnTo === "string";
}

// 우리 사이트 안의 경로로만 돌아간다. "//다른사이트"는 다른 도메인으로 해석되고,
// 콜백 경로로 돌아가면 이미 쓴 로그인 시도로 실패 화면이 뜬다.
function safeReturnTo(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith(KAKAO_CALLBACK_PATH)) return "/";
  return path;
}
