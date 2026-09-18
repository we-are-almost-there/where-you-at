// @vitest-environment jsdom
// authToken 테스트. 저장소 접근이 막혀도 이번 화면의 요청에는 토큰이 붙는지 확인한다.
import { afterEach, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  const token = await import("./authToken");
  const http = await import("./http");
  return { ...token, authHeaders: http.authHeaders };
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

it("저장소에 쓰지 못해도 요청에 토큰을 붙인다", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("QuotaExceededError");
  });
  const { writeAccessToken, readAccessToken, authHeaders } = await load();

  writeAccessToken("our-token");

  expect(readAccessToken()).toBe("our-token");
  expect(authHeaders()).toEqual({ Authorization: "Bearer our-token" });
});

it("저장소에서 지우지 못해도 이번 화면에서는 토큰을 붙이지 않는다", async () => {
  localStorage.setItem("auth.accessToken", "our-token");
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new DOMException("SecurityError");
  });
  const { clearAccessToken, readAccessToken, authHeaders } = await load();
  expect(readAccessToken()).toBe("our-token");

  clearAccessToken();

  expect(readAccessToken()).toBeNull();
  expect(authHeaders()).toEqual({});
});
