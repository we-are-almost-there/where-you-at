// 로그인 API
// - 다른 API와 같이 사용자 문구로 바꾸지 않는다(lib/http). 화면 문구 변환은 컴포넌트가 한다.
// - 401은 status가 담긴 HttpError라 호출부가 "다시 로그인"과 그 밖의 실패를 구분한다.

import { authHeaders, fetchOrNetworkError, HttpError } from "../../lib/http";

// ??가 아니라 ||인 이유는 raceApi.ts 참고 (빈 값도 폴백으로 보낸다).
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export interface User {
  id: number;
  nickname: string | null;
  /** 한 줄 소개(40자). 적지 않았으면 null. 서버에 칸이 생기기 전 응답에는 없을 수 있다. */
  bio?: string | null;
  /** 비공개 R2 사진의 임시 보기 URL. 사진이 없으면 null. */
  avatar_url?: string | null;
}

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** 프로필 수정 요청. 보낸 칸만 바뀐다. bio를 빈 문자열로 보내면 지운다. */
export interface ProfileChanges {
  nickname?: string;
  bio?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

/** 카카오 인가 코드로 로그인한다. redirect_uri는 서버 설정값을 쓰므로 보내지 않는다. */
export async function loginWithKakao(code: string): Promise<LoginResponse> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/auth/kakao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new HttpError(res.status, `카카오 로그인 실패 (${res.status})`);
  return res.json();
}

export async function fetchMe(): Promise<User> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/me`, { headers: authHeaders() });
  if (!res.ok) throw new HttpError(res.status, `회원 정보 조회 실패 (${res.status})`);
  return res.json();
}

/** 닉네임·한 줄 소개를 바꾼다. 서버가 앞뒤 공백을 지운 값을 돌려주므로 화면은 응답 값을 쓴다. */
export async function updateMe(body: ProfileChanges): Promise<User> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/me`, {
    method: "PATCH",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new HttpError(res.status, `회원 정보 수정 실패 (${res.status})`);
  return res.json();
}

/** 서버가 크기와 실제 파일 형식을 확인한 뒤 비공개 R2에 저장한다. */
export async function uploadAvatar(file: File): Promise<User> {
  // 서버에서도 스트리밍 중 같은 제한을 강제한다. 여기서는 불필요한 네트워크 전송을 먼저 막는다.
  if (file.size > AVATAR_MAX_BYTES) throw new HttpError(413, "프로필 사진 용량 초과");

  const res = await fetchOrNetworkError(`${API_BASE}/api/me/avatar`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new HttpError(res.status, `프로필 사진 저장 실패 (${res.status})`);
  return res.json();
}

/** 현재 프로필 사진 연결을 지우고 기본 이미지로 되돌린다. */
export async function deleteAvatar(): Promise<User> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/me/avatar`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new HttpError(res.status, `프로필 사진 삭제 실패 (${res.status})`);
  return res.json();
}

export async function logout(): Promise<void> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new HttpError(res.status, `로그아웃 실패 (${res.status})`);
}

export async function deleteMe(): Promise<void> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/me`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new HttpError(res.status, `회원 탈퇴 실패 (${res.status})`);
}
