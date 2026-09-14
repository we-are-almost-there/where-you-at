import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOrNetworkError, NetworkError } from "./http";

describe("fetchOrNetworkError", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch가 TypeError로 실패하면 원래 오류를 cause로 담은 NetworkError를 던진다", async () => {
    const original = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(original));

    const err = await fetchOrNetworkError("/test").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect((err as NetworkError).cause).toBe(original);
  });

  it("요청 취소(AbortError)는 감싸지 않고 같은 객체로 던진다", async () => {
    const aborted = new DOMException("The operation was aborted.", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(aborted));

    await expect(fetchOrNetworkError("/test")).rejects.toBe(aborted);
  });

  it("정상 Response는 같은 객체로 반환한다", async () => {
    const response = new Response();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(fetchOrNetworkError("/test")).resolves.toBe(response);
  });
});
