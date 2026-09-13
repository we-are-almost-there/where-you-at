// helpApi 테스트 (vitest, fetch mock).
//
// 테스트 범위: 요청 주소와 에러 종류 보존에 한정한다.
//   - 목록은 page·per_page를 쿼리로 보낸다 (서버 쿼리 이름은 per_page, 화면 쪽 이름은 perPage)
//   - 404면 status가 담긴 HttpError (공지 상세가 "찾을 수 없어요"를 고르는 근거)
//   - fetch가 TypeError로 실패하면 그대로 TypeError (toUserError가 연결 실패로 판별하는 근거)
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../components/error/userError";
import { fetchFaqs, fetchNotice, fetchNotices } from "./helpApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchNotices", () => {
  it("page와 per_page를 쿼리로 보낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ total: 0, page: 2, per_page: 10, items: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchNotices({ page: 2, perPage: 10 });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/notices");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
  });
});

describe("fetchNotice", () => {
  it("없거나 공개 전인 공지면 status 404인 HttpError를 throw한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));

    const err = await fetchNotice(999).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
  });
});

describe("fetchFaqs", () => {
  it("fetch가 TypeError로 실패하면 TypeError를 그대로 throw한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(fetchFaqs()).rejects.toBeInstanceOf(TypeError);
  });
});
