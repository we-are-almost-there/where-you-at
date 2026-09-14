import { afterEach, expect, it, vi } from "vitest";
import { fetchAllRaces, fetchRacePage } from "./raceApi";
import { HttpError } from "../../lib/http";

afterEach(() => vi.unstubAllGlobals());
const response = (page: number, ids: number[], total = 8) => new Response(JSON.stringify({
  page, per_page: 2, total, items: ids.map((event_id) => ({ event_id })),
}));

it("한 페이지 조회는 필터·페이지·signal을 전달하고 메타데이터를 반환한다", async () => {
  const fetch = vi.fn().mockResolvedValue(response(2, [3, 4]));
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const result = await fetchRacePage({ page: 2, per_page: 2, region_code: "11", event_type: "running", upcoming_only: false }, controller.signal);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ page: "2", per_page: "2", region_code: "11", event_type: "running", upcoming_only: "false" });
  expect(options.signal).toBe(controller.signal);
  expect(result).toMatchObject({ total: 8, page: 2, per_page: 2 });
});

it("최대 3개씩 조회하며 응답 순서와 무관하게 페이지 순서로 중복을 제거한다", async () => {
  const pending = new Map<number, (value: Response) => void>();
  const fetch = vi.fn((url: string) => {
    const page = Number(new URL(url).searchParams.get("page"));
    if (page === 1) return Promise.resolve(response(1, [1, 2], 10));
    expect(new URL(url).searchParams.get("per_page")).toBe("2");
    return new Promise<Response>((resolve) => pending.set(page, resolve));
  });
  vi.stubGlobal("fetch", fetch);
  const result = fetchAllRaces();
  await vi.waitFor(() => expect(pending.size).toBe(3));
  expect(fetch).toHaveBeenCalledTimes(4);
  pending.get(4)!(response(4, [6, 7], 10));
  pending.get(3)!(response(3, [4, 5], 10));
  pending.get(2)!(response(2, [2, 3], 10));
  await vi.waitFor(() => expect(pending.has(5)).toBe(true));
  pending.get(5)!(response(5, [8, 9], 10));
  expect((await result).map((race) => race.event_id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

it("빈 목록은 첫 페이지만 조회한다", async () => {
  const fetch = vi.fn().mockResolvedValue(response(1, [], 0));
  vi.stubGlobal("fetch", fetch);
  await expect(fetchAllRaces()).resolves.toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([fetchRacePage, fetchAllRaces])("이미 취소된 요청은 네트워크를 호출하지 않는다", async (request) => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  controller.abort();
  await expect(request({}, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).not.toHaveBeenCalled();
});

it("취소 시 진행 중인 요청을 중단하고 다음 묶음을 요청하지 않는다", async () => {
  const signals: AbortSignal[] = [];
  const fetch = vi.fn((url: string, options: RequestInit) => {
    if (new URL(url).searchParams.get("page") === "1") return Promise.resolve(response(1, [1, 2], 10));
    const signal = options.signal!;
    signals.push(signal);
    return new Promise<Response>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const result = fetchAllRaces({}, controller.signal);
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(signals).toHaveLength(3));
  controller.abort();
  await rejected;
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(4);
});

it("중간 페이지 실패 시 부분 결과를 반환하지 않고 나머지 요청도 취소한다", async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string, options: RequestInit) => {
    const page = Number(new URL(url).searchParams.get("page"));
    if (page === 1) return Promise.resolve(response(1, [1, 2]));
    if (page === 2) return Promise.resolve(new Response(null, { status: 500 }));
    const signal = options.signal!;
    signals.push(signal);
    return new Promise<Response>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  }));
  await expect(fetchAllRaces()).rejects.toBeInstanceOf(HttpError);
  expect(signals).toHaveLength(2);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});
