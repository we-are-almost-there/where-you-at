// helpApi 테스트 (vitest, fetch mock).
//
// 테스트 범위: 요청 주소·본문과 에러 종류 보존에 한정한다.
//   - 목록은 page·per_page를 쿼리로 보낸다 (서버 쿼리 이름은 per_page, 화면 쪽 이름은 perPage)
//   - 404면 status가 담긴 HttpError (공지 상세가 "찾을 수 없어요"를 고르는 근거)
//   - fetch가 연결에 실패하면 NetworkError (toUserError가 연결 실패로 판별하는 근거)
//   - 문의 접수는 JSON으로 POST하고, 429면 status가 담긴 HttpError (문의 폼이 안내를 고르는 근거)
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, NetworkError } from "../../lib/http";
import { createInquiry, fetchFaqs, fetchNotice, fetchNotices } from "./helpApi";

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
  it("fetch가 TypeError로 실패하면 NetworkError를 throw한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(fetchFaqs()).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("createInquiry", () => {
  const body = {
    category: "코스 탐색" as const,
    email: "user@example.com",
    content: "코스 경로가 실제 길과 달라요.",
    agreed: true,
    website: "",
  };

  it("본문을 JSON으로 /api/inquiries에 POST한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ received: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(createInquiry(body)).resolves.toEqual({ received: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/api/inquiries");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("너무 자주 보내 429면 status가 담긴 HttpError를 throw한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));

    const err = await createInquiry(body).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(429);
  });
});
