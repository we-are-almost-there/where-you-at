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
  it("티켓 발급, R2 PUT, 서버 검증 완료를 순서대로 수행한다", async () => {
    const user = { id: 7, nickname: "길손", avatar_url: "https://view.example/avatar" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          upload_url: "https://r2.example/upload",
          upload_key: "uploads/7/key.webp",
          max_bytes: 5 * 1024 * 1024,
        }),
      )
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce(jsonResponse(200, user));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["image"], "avatar.webp", { type: "image/webp" });

    await expect(uploadAvatar(file)).resolves.toEqual(user);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer our-token", "Content-Type": "application/json" },
      body: JSON.stringify({ content_type: "image/webp" }),
    });
    expect(fetchMock.mock.calls[1]).toEqual([
      "https://r2.example/upload",
      { method: "PUT", headers: { "Content-Type": "image/webp" }, body: file },
    ]);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer our-token", "Content-Type": "application/json" },
      body: JSON.stringify({ upload_key: "uploads/7/key.webp" }),
    });
  });

  it("서버가 알려 준 제한보다 큰 파일은 R2로 보내지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        upload_url: "https://r2.example/upload",
        upload_key: "uploads/7/key.png",
        max_bytes: 1,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["too large"], "avatar.png", { type: "image/png" });

    await expect(uploadAvatar(file)).rejects.toMatchObject({ status: 413 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
