import { afterEach, expect, it, vi } from "vitest";
import { HttpError } from "../../lib/http";
import { createStamp, fetchStamps } from "./stampsApi";
import { clearAccessToken, writeAccessToken } from "../../lib/authToken";

const { expireAuthSession } = vi.hoisted(() => ({ expireAuthSession: vi.fn() }));
vi.mock("../auth/useAuth", () => ({ expireAuthSession }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearAccessToken();
});

const requests = [fetchStamps, () => createStamp("51110")];

it.each(requests)("기능 비공개 응답의 상세를 보존한다 (%#)", async (request) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "아직 제공하지 않는 기능입니다." }), { status: 503 })));
  await expect(request()).rejects.toMatchObject({ status: 503, detail: "아직 제공하지 않는 기능입니다." });
});

it.each(requests)("401이면 만료된 인증 상태를 정리한다 (%#)", async (request) => {
  writeAccessToken("expired-token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  await expect(request()).rejects.toMatchObject({ status: 401 });
  expect(expireAuthSession).toHaveBeenCalledTimes(1);
});

it.each(requests)("이전 요청의 401로 새 로그인 세션을 지우지 않는다 (%#)", async (request) => {
  writeAccessToken("old-token");
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done; })));
  const pending = request();
  writeAccessToken("new-token");
  resolve(new Response(null, { status: 401 }));
  await expect(pending).rejects.toMatchObject({ status: 401 });
  expect(expireAuthSession).not.toHaveBeenCalled();
});

it.each(requests)("서버 오류로는 로그아웃하지 않는다 (%#)", async (request) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
  await expect(request()).rejects.toMatchObject({ status: 500 });
  expect(expireAuthSession).not.toHaveBeenCalled();
});

it("서버 상태와 날짜를 camelCase로 변환한다", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([
    { sigungu_code: "51110", status: "AVAILABLE", stamped_at: null },
  ])));
  vi.stubGlobal("fetch", fetch);
  expect(await fetchStamps()).toEqual([{ sigunguCode: "51110", status: "AVAILABLE", stampedAt: null }]);
  expect(fetch.mock.calls[0][0]).toContain("/api/me/sigungu-stamps");
});

it.each([200, 201])("POST %s 응답의 서버 시각을 사용한다", async (status) => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    sigungu_code: "51110", status: "STAMPED", stamped_at: "2026-09-21T00:00:00Z", created: status === 201,
  }), { status }));
  vi.stubGlobal("fetch", fetch);
  expect(await createStamp("51110")).toEqual({ sigunguCode: "51110", status: "STAMPED", stampedAt: "2026-09-21T00:00:00Z" });
  expect(fetch.mock.calls[0][1].method).toBe("POST");
});

it("409를 화면에서 구분할 수 있게 유지한다", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 409 })));
  await expect(createStamp("51110")).rejects.toMatchObject({ status: 409 });
  await expect(createStamp("51110")).rejects.toBeInstanceOf(HttpError);
});
