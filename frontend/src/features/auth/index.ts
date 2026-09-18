// 로그인 상태와 타입만 내보낸다. 페이지 컴포넌트(KakaoCallback)는 App.tsx가 파일에서 직접 가져간다.
// KakaoCallback이 AppHeader를 쓰므로 여기서 내보내면, 헤더나 사이드바가 이 배럴을 가져올 때
// AppHeader → index → KakaoCallback → AppHeader 순환이 생긴다.

export { useAuth, signOut, updateProfile, withdraw } from "./useAuth";
export type { AuthState } from "./useAuth";
export type { ProfileChanges, User } from "./authApi";
export { KAKAO_CALLBACK_PATH, startKakaoLogin } from "./kakaoRedirect";
// 로그인 버튼은 startKakaoLogin 대신 이 훅을 쓴다. 만 14세 이상인지 먼저 확인한다.
export { useKakaoLogin } from "./useKakaoLogin";
