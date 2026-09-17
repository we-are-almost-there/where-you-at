// 로그인 토큰 보관. 백엔드가 다른 사이트(Render)라 쿠키 대신 localStorage에 두고 헤더로 보낸다.
// 사생활 보호 모드 등에서 저장소 접근이 막히면 예외가 나므로 모두 try/catch로 감싼다.
// 저장에 실패해도 요청에는 토큰이 붙도록 메모리에도 둔다. 이때 로그인은 새로고침 전까지만 유지된다.

const STORAGE_KEY = "auth.accessToken";

// 이 화면에서 쓰거나 지운 토큰. undefined면 아직 바꾼 적이 없어 저장소 값을 읽는다.
let memoryToken: string | null | undefined;

export function readAccessToken(): string | null {
  if (memoryToken !== undefined) return memoryToken;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeAccessToken(token: string): void {
  memoryToken = token;
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // 저장하지 못해도 메모리 값으로 이번 화면에서는 로그인 상태를 유지한다.
  }
}

export function clearAccessToken(): void {
  memoryToken = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 메모리 값을 먼저 읽으므로 저장소에 남아도 이번 화면에서는 로그아웃 상태다.
  }
}
