// 로그인 상태 저장소.
//
// 헤더와 사이드바가 동시에 쓰므로 모듈 수준에 상태를 하나 두고 useSyncExternalStore로 구독한다.
// Provider를 두지 않아도 되고, 구독자가 여럿이어도 /api/me는 한 번에 하나만 호출한다.
//
// 주의: /api/me가 연결 실패나 서버 오류로 끝나면 화면은 로그아웃 상태지만 토큰은 남아 있어,
// authHeaders()는 계속 토큰을 붙인다. 토큰이 유효하면 로그인이 필요한 요청도 성공할 수 있다.

import { useSyncExternalStore } from "react";
import { clearAccessToken, readAccessToken, writeAccessToken } from "../../lib/authToken";
import { HttpError } from "../../lib/http";
import { deleteMe, fetchMe, updateMe, type ProfileChanges, type User } from "./authApi";

export type AuthState =
  | { status: "loading"; user: null }
  | { status: "signedOut"; user: null }
  | { status: "signedIn"; user: User };

const SIGNED_OUT: AuthState = { status: "signedOut", user: null };

let state: AuthState = readAccessToken() ? { status: "loading", user: null } : SIGNED_OUT;
// 토큰이 유효한지 아직 확인하지 못했으면 true. 연결 실패나 서버 오류 뒤에도 true로 남아,
// 다음 구독(페이지를 옮겨 헤더가 다시 그려질 때 등)에서 다시 확인한다.
let needsCheck = state.status === "loading";
let checking = false;
// 로그인이나 로그아웃이 일어나면 늘린다. 그 전에 보낸 /api/me 응답이 늦게 도착해도 상태를 덮어쓰지 않게 한다.
let generation = 0;
const listeners = new Set<() => void>();

function setState(next: AuthState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  checkMe();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

function checkMe() {
  if (!needsCheck || checking) return;
  checking = true;
  const requestedGeneration = generation;

  fetchMe()
    .then(
      (user) => {
        if (requestedGeneration !== generation) return;
        needsCheck = false;
        setState({ status: "signedIn", user });
      },
      (error: unknown) => {
        if (requestedGeneration !== generation) return;
        // 401은 토큰이 만료됐거나 탈퇴한 회원이라 토큰을 지우고 다시 확인하지 않는다.
        // 연결 실패나 서버 오류(Render가 깨어나는 중 등)는 토큰이 멀쩡할 수 있어 남겨 두고 다음 구독 때 다시 확인한다.
        // 다시 확인하는 동안에는 로그아웃 상태를 유지해 버튼이 사라졌다 나타나지 않게 한다.
        if (error instanceof HttpError && error.status === 401) {
          needsCheck = false;
          clearAccessToken();
        }
        setState(SIGNED_OUT);
      },
    )
    .finally(() => {
      checking = false;
    });
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function signIn(accessToken: string, user: User): void {
  generation += 1;
  needsCheck = false;
  writeAccessToken(accessToken);
  setState({ status: "signedIn", user });
}

/** 토큰을 지운다. 서버에는 알리지 않으므로 이미 발급한 토큰은 만료 전까지 유효하다. */
export function signOut(): void {
  generation += 1;
  needsCheck = false;
  clearAccessToken();
  setState(SIGNED_OUT);
}

/**
 * 프로필(닉네임·한 줄 소개) 수정. 성공하면 서버가 돌려준 회원 정보로 바꿔, 헤더와 마이페이지가 함께 새 값을 그린다.
 * 401이면 탈퇴 때와 같이 로그아웃한 뒤 던진다. 그 밖의 실패는 상태를 그대로 두고 던진다.
 */
export async function updateProfile(changes: ProfileChanges): Promise<void> {
  const requestedGeneration = generation;
  let user: User;
  try {
    user = await updateMe(changes);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) signOut();
    throw error;
  }
  // 응답을 기다리는 사이 로그아웃했으면 다시 로그인 상태로 되돌리지 않는다.
  if (requestedGeneration !== generation || state.status !== "signedIn") return;
  setState({ status: "signedIn", user });
}

/**
 * 회원 탈퇴. 성공(204)하면 로그아웃한다. 서버는 이미 지운 회원에게도 204를 돌려준다.
 *
 * 실패하면 오류를 그대로 던져, 호출한 화면이 안내하게 한다.
 * - 401: 토큰이 없거나 만료된 것이라 탈퇴되지 않았다. 로그아웃한 뒤 던진다.
 *   화면은 "다시 로그인한 뒤 탈퇴해 주세요"처럼 안내한다. 탈퇴 완료로 보이면 안 된다.
 * - 그 밖의 실패: 로그인 상태를 그대로 둔다.
 */
export async function withdraw(): Promise<void> {
  try {
    await deleteMe();
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) signOut();
    throw error;
  }
  signOut();
}
