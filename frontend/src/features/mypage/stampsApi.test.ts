import { afterEach, expect, it, vi } from "vitest";
import { HttpError } from "../../lib/http";
import { createStamp, fetchStamps } from "./stampsApi";

afterEach(() => vi.unstubAllGlobals());

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
