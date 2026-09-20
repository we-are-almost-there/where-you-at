// @vitest-environment jsdom
// useAuth 테스트 (vitest, fetch mock).
//
// 저장소가 모듈 수준 상태라 테스트마다 모듈을 새로 불러온다.
// 테스트 범위:
//   - 토큰이 없으면 /api/me를 부르지 않는다
//   - 구독자가 여럿이어도 /api/me는 한 번만 부른다
//   - 401이면 토큰을 지우고, 연결 실패나 서버 오류면 토큰을 남겨 다음 구독 때 다시 확인한다
//   - 로그인 뒤 늦게 온 /api/me 응답이 상태를 덮어쓰지 않는다
//   - 로그아웃은 서버 세션 삭제가 확인된 뒤 토큰을 지우고, 탈퇴 성공은 로그아웃 API를 중복 호출하지 않는다
//   - 프로필 수정은 응답 값으로 상태를 바꾸고, 401이면 로그아웃 API 없이 로컬 상태만 지운다. 기다리는 사이 로그아웃했으면 되살리지 않는다
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER = { id: 7, nickname: "길손" };
const TOKEN_KEY = "auth.accessToken";

function jsonResponse(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function loadAuth() {
  vi.resetModules();
  return import("./useAuth");
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useAuth", () => {
  it("토큰이 없으면 요청 없이 로그아웃 상태다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { useAuth } = await loadAuth();

    const { result } = renderHook(() => useAuth());

    expect(result.current.status).toBe("signedOut");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("토큰이 있으면 /api/me를 한 번만 불러 로그인 상태가 된다", async () => {
    localStorage.setItem(TOKEN_KEY, "our-token");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, USER));
    vi.stubGlobal("fetch", fetchMock);
    const { useAuth } = await loadAuth();

    const header = renderHook(() => useAuth());
    const sidebar = renderHook(() => useAuth());
    expect(header.result.current.status).toBe("loading");

    await waitFor(() => expect(header.result.current).toEqual({ status: "signedIn", user: USER }));
    expect(sidebar.result.current).toEqual({ status: "signedIn", user: USER });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/api/me");
    expect(init.headers).toEqual({ Authorization: "Bearer our-token" });
  });

  it("/api/me가 401이면 토큰을 지운다", async () => {
    localStorage.setItem(TOKEN_KEY, "expired-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401)));
    const { useAuth } = await loadAuth();

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("연결 실패나 서버 오류면 토큰을 남기고, 다음 구독 때 다시 확인한다", async () => {
    for (const failure of [
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => Promise.resolve(jsonResponse(502)),
    ]) {
      localStorage.setItem(TOKEN_KEY, "our-token");
      const fetchMock = vi.fn().mockImplementationOnce(failure).mockResolvedValueOnce(jsonResponse(200, USER));
      vi.stubGlobal("fetch", fetchMock);
      const { useAuth } = await loadAuth();

      const first = renderHook(() => useAuth());
      await waitFor(() => expect(first.result.current.status).toBe("signedOut"));
      expect(localStorage.getItem(TOKEN_KEY)).toBe("our-token");
      first.unmount();

      // 페이지를 옮겨 헤더가 다시 그려진 상황
      const second = renderHook(() => useAuth());
      expect(second.result.current.status).toBe("signedOut");
      await waitFor(() => expect(second.result.current).toEqual({ status: "signedIn", user: USER }));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      second.unmount();
    }
  });

  it("401 뒤에는 다시 확인하지 않는다", async () => {
    localStorage.setItem(TOKEN_KEY, "expired-token");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401));
    vi.stubGlobal("fetch", fetchMock);
    const { useAuth } = await loadAuth();

    const first = renderHook(() => useAuth());
    await waitFor(() => expect(first.result.current.status).toBe("signedOut"));
    first.unmount();
    renderHook(() => useAuth());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("로그인한 뒤 늦게 온 /api/me 실패가 로그인 상태를 덮어쓰지 않는다", async () => {
    localStorage.setItem(TOKEN_KEY, "old-token");
    let respond: (value: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise((resolve) => (respond = resolve))));
    const { useAuth, signIn } = await loadAuth();
    const { result } = renderHook(() => useAuth());

    act(() => signIn("new-token", USER));
    await act(async () => respond(jsonResponse(401)));

    expect(result.current).toEqual({ status: "signedIn", user: USER });
    expect(localStorage.getItem(TOKEN_KEY)).toBe("new-token");
  });

  it("로그아웃에 성공하면 현재 토큰으로 서버 세션을 지운 뒤 로컬 토큰을 지운다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(204));
    vi.stubGlobal("fetch", fetchMock);
    const { useAuth, signIn, signOut } = await loadAuth();
    const { result } = renderHook(() => useAuth());

    act(() => signIn("our-token", USER));
    expect(result.current.status).toBe("signedIn");
    await act(() => signOut());

    expect(result.current.status).toBe("signedOut");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/api/auth/logout");
    expect(init).toEqual({ method: "POST", headers: { Authorization: "Bearer our-token" } });
  });

  it("로그아웃 응답이 401이면 이미 무효한 토큰을 로컬에서도 지운다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401)));
    const { useAuth, signIn, signOut } = await loadAuth();
    const { result } = renderHook(() => useAuth());
    act(() => signIn("expired-token", USER));

    await act(() => signOut());

    expect(result.current.status).toBe("signedOut");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("다른 인증 API가 401이면 서버 요청 없이 로컬 세션을 만료시킨다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { expireAuthSession, signIn, useAuth } = await loadAuth();
    const { result } = renderHook(() => useAuth());
    act(() => signIn("expired-token", USER));

    act(() => expireAuthSession());

    expect(result.current.status).toBe("signedOut");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("로그아웃 연결 실패나 서버 오류면 토큰과 로그인 상태를 유지한다", async () => {
    for (const failure of [
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => Promise.resolve(jsonResponse(500)),
    ]) {
      const fetchMock = vi.fn().mockImplementationOnce(failure);
      vi.stubGlobal("fetch", fetchMock);
      const { useAuth, signIn, signOut } = await loadAuth();
      const { result } = renderHook(() => useAuth());
      act(() => signIn("our-token", USER));

      await expect(signOut()).rejects.toBeInstanceOf(Error);

      expect(result.current.status).toBe("signedIn");
      expect(localStorage.getItem(TOKEN_KEY)).toBe("our-token");
      cleanup();
    }
  });
});

describe("withdraw", () => {
  it("탈퇴에 성공하면 로그아웃한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(204));
    vi.stubGlobal("fetch", fetchMock);
    const { useAuth, signIn, withdraw } = await loadAuth();
    const { result } = renderHook(() => useAuth());
    act(() => signIn("our-token", USER));

    await act(() => withdraw());

    expect(result.current.status).toBe("signedOut");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/api/me");
    expect(init).toEqual({ method: "DELETE", headers: { Authorization: "Bearer our-token" } });
  });

  it("탈퇴 요청이 401이면 이미 처리됐거나 무효한 토큰이므로 로컬 상태를 지우고 오류를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401)));
    const { useAuth, signIn, withdraw } = await loadAuth();
    const { result } = renderHook(() => useAuth());
    act(() => signIn("expired-token", USER));

    await act(() => expect(withdraw()).rejects.toMatchObject({ status: 401 }));

    expect(result.current.status).toBe("signedOut");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("그 밖의 실패는 오류를 던지고 로그인 상태를 유지한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500)));
    const { useAuth, signIn, withdraw } = await loadAuth();
    const { result } = renderHook(() => useAuth());
    act(() => signIn("our-token", USER));

    await expect(withdraw()).rejects.toMatchObject({ status: 500 });

    expect(result.current.status).toBe("signedIn");
    expect(localStorage.getItem(TOKEN_KEY)).toBe("our-token");
  });
});

describe("updateProfile", () => {
  it("성공하면 서버가 돌려준 닉네임으로 로그인 상태를 바꾼다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 7, nickname: "새 이름" }));
    vi.stubGlobal("fetch", fetchMock);
    const { useAuth, signIn, updateProfile } = await loadAuth();
    const { result } = renderHook(() => useAuth());
    act(() => signIn("our-token", USER));

    await act(() => updateProfile({ nickname: "새 이름" }));

    expect(result.current).toEqual({ status: "signedIn", user: { id: 7, nickname: "새 이름" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/api/me");
    expect(init).toEqual({
      method: "PATCH",
      headers: { Authorization: "Bearer our-token", "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "새 이름" }),
    });
  });

  it("401이면 로그아웃 API 없이 로컬 상태만 지우고 오류를 던진다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401));
    vi.stubGlobal("fetch", fetchMock);
    const { useAuth, signIn, updateProfile } = await loadAuth();
    const { result } = renderHook(() => useAuth());
    act(() => signIn("expired-token", USER));

    await act(() => expect(updateProfile({ nickname: "새 이름" })).rejects.toMatchObject({ status: 401 }));

    expect(result.current.status).toBe("signedOut");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    // 서버 세션이 이미 없으므로 로그아웃 API를 다시 부르지 않는다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("그 밖의 실패는 오류를 던지고 닉네임을 그대로 둔다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500)));
    const { useAuth, signIn, updateProfile } = await loadAuth();
    const { result } = renderHook(() => useAuth());
    act(() => signIn("our-token", USER));

    await expect(updateProfile({ nickname: "새 이름" })).rejects.toMatchObject({ status: 500 });

    expect(result.current).toEqual({ status: "signedIn", user: USER });
  });

  it("응답을 기다리는 사이 로그아웃했으면 다시 로그인 상태로 되돌리지 않는다", async () => {
    let resolveUpdate: (value: unknown) => void = () => {};
    // 첫 요청(프로필 수정)은 응답을 붙잡아 두고, 둘째 요청(로그아웃)은 바로 성공시킨다.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockReturnValueOnce(new Promise((r) => (resolveUpdate = r)))
        .mockResolvedValueOnce(jsonResponse(204)),
    );
    const { useAuth, signIn, signOut, updateProfile } = await loadAuth();
    const { result } = renderHook(() => useAuth());
    act(() => signIn("our-token", USER));

    const pending = updateProfile({ nickname: "새 이름" });
    await act(() => signOut());
    expect(result.current.status).toBe("signedOut");
    resolveUpdate(jsonResponse(200, { id: 7, nickname: "새 이름" }));
    await act(() => pending);

    expect(result.current.status).toBe("signedOut");
  });
});
