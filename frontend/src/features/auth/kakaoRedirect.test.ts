// @vitest-environment jsdom
// kakaoRedirect 테스트.
//
// 테스트 범위: 카카오 인가 주소의 파라미터, 로그인 시도 저장과 읽기, 돌아갈 경로 검증.
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLoginAttempt, prepareKakaoLogin, readLoginAttempt } from "./kakaoRedirect";

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("prepareKakaoLogin", () => {
  it("로그인 앱 키와 콜백 주소, 저장한 state로 인가 주소를 만든다", () => {
    vi.stubEnv("VITE_KAKAO_LOGIN_CLIENT_ID", "login-app-key");

    const url = new URL(prepareKakaoLogin("/courses?type=walk"));

    expect(`${url.origin}${url.pathname}`).toBe("https://kauth.kakao.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("login-app-key");
    expect(url.searchParams.get("redirect_uri")).toBe(`${window.location.origin}/auth/kakao/callback`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(readLoginAttempt()).toEqual({ state: url.searchParams.get("state"), returnTo: "/courses?type=walk" });
  });

  it("시도할 때마다 다른 state를 만든다", () => {
    const first = new URL(prepareKakaoLogin("/")).searchParams.get("state");
    const second = new URL(prepareKakaoLogin("/")).searchParams.get("state");

    expect(first).not.toBe(second);
    expect(readLoginAttempt()?.state).toBe(second);
  });

  it("randomUUID가 없는 HTTP 주소(휴대폰 실기기 테스트)에서도 state를 만든다", () => {
    const { getRandomValues } = crypto;
    vi.stubGlobal("crypto", { getRandomValues: getRandomValues.bind(crypto) });

    const state = new URL(prepareKakaoLogin("/")).searchParams.get("state");

    expect(state).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("readLoginAttempt", () => {
  const save = (value: unknown) => sessionStorage.setItem("auth.kakaoLogin", JSON.stringify(value));

  it("저장된 값이 없거나 형식이 다르면 null이다", () => {
    expect(readLoginAttempt()).toBeNull();
    sessionStorage.setItem("auth.kakaoLogin", "{깨진 JSON");
    expect(readLoginAttempt()).toBeNull();
    save({ state: "", returnTo: "/" });
    expect(readLoginAttempt()).toBeNull();
    save({ state: "s", returnTo: 1 });
    expect(readLoginAttempt()).toBeNull();
  });

  it("사이트 밖이나 콜백 경로로는 돌아가지 않는다", () => {
    for (const returnTo of ["https://evil.example", "//evil.example", "/auth/kakao/callback?code=x"]) {
      save({ state: "s", returnTo });
      expect(readLoginAttempt()?.returnTo).toBe("/");
    }
  });

  it("지우면 다시 읽을 수 없다", () => {
    save({ state: "s", returnTo: "/support" });
    clearLoginAttempt();
    expect(readLoginAttempt()).toBeNull();
  });
});
