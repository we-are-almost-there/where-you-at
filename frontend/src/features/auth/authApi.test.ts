// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAvatar, uploadAvatar } from "./authApi";

const TOKEN_KEY = "auth.accessToken";

function jsonResponse(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => localStorage.setItem(TOKEN_KEY, "our-token"));
afterEach(() => vi.unstubAllGlobals());

describe("uploadAvatar", () => {
  it("인증된 서버 업로드 요청으로 파일을 보내고 갱신된 회원 정보를 받는다", async () => {
    const user = { id: 7, nickname: "길손", avatar_url: "https://view.example/avatar" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, user));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["image"], "avatar.webp", { type: "image/webp" });

    await expect(uploadAvatar(file)).resolves.toEqual(user);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/me\/avatar$/), {
      method: "PUT",
      headers: { Authorization: "Bearer our-token", "Content-Type": "image/webp" },
      body: file,
    });
  });

  it("5MB보다 큰 파일은 서버로 보내지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "avatar.png", { type: "image/png" });

    await expect(uploadAvatar(file)).rejects.toMatchObject({ status: 413 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("deleteAvatar", () => {
  it("인증된 삭제 요청을 보내고 기본 이미지 회원 정보를 받는다", async () => {
    const user = { id: 7, nickname: "길손", bio: null };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, user));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteAvatar()).resolves.toEqual(user);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/me\/avatar$/), {
      method: "DELETE",
      headers: { Authorization: "Bearer our-token" },
    });
  });
});
