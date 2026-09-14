import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { fetchNearbyAccommodations as FetchAccommodations } from "./raceApi";

let fetchNearbyAccommodations: typeof FetchAccommodations;
const stays = [{ content_id: "stay-1", tour_spot_title: "숙소", addr1: null,
  first_image: null, distance_km: 1, map_x: null, map_y: null }];
const freshResponse = () => new Response(JSON.stringify(stays));

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T00:00:00Z"));
  ({ fetchNearbyAccommodations } = await import("./raceApi"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("같은 대회·반경은 5분 직전까지 캐시를 반환한다", async () => {
  const fetch = vi.fn(async () => freshResponse());
  vi.stubGlobal("fetch", fetch);
  await expect(fetchNearbyAccommodations(1, 5)).resolves.toEqual(stays);
  vi.advanceTimersByTime(5 * 60 * 1000 - 1);
  await expect(fetchNearbyAccommodations(1, 5)).resolves.toEqual(stays);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("정확히 5분이 되면 새 응답을 요청한다", async () => {
  const fetch = vi.fn(async () => freshResponse());
  vi.stubGlobal("fetch", fetch);
  await fetchNearbyAccommodations(1, 5);
  vi.advanceTimersByTime(5 * 60 * 1000);
  await expect(fetchNearbyAccommodations(1, 5)).resolves.toEqual(stays);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("대회나 반경이 다르면 별도로 요청한다", async () => {
  const fetch = vi.fn(async () => freshResponse());
  vi.stubGlobal("fetch", fetch);
  await fetchNearbyAccommodations(1, 5);
  await fetchNearbyAccommodations(1, 10);
  await fetchNearbyAccommodations(2, 5);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("빈 결과도 캐시한다", async () => {
  const fetch = vi.fn(async () => new Response("[]"));
  vi.stubGlobal("fetch", fetch);
  await expect(fetchNearbyAccommodations(1)).resolves.toEqual([]);
  await expect(fetchNearbyAccommodations(1)).resolves.toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("실패한 요청은 캐시하지 않고 다시 요청한다", async () => {
  const fetch = vi.fn(async () => freshResponse())
    .mockResolvedValueOnce(new Response(null, { status: 500 }));
  vi.stubGlobal("fetch", fetch);
  await expect(fetchNearbyAccommodations(1)).rejects.toMatchObject({ status: 500 });
  await expect(fetchNearbyAccommodations(1)).resolves.toEqual(stays);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("진행 중 취소된 요청은 캐시하지 않는다", async () => {
  const controller = new AbortController();
  const fetch = vi.fn(async () => freshResponse()).mockImplementationOnce(() =>
    new Promise<Response>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
    }));
  vi.stubGlobal("fetch", fetch);
  const result = fetchNearbyAccommodations(1, 5, controller.signal);
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await rejected;
  await expect(fetchNearbyAccommodations(1)).resolves.toEqual(stays);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("JSON 처리 중 취소되면 성공 응답도 캐시하지 않는다", async () => {
  const controller = new AbortController();
  const response = freshResponse();
  vi.spyOn(response, "json").mockImplementation(async () => {
    controller.abort();
    return stays;
  });
  const fetch = vi.fn(async () => freshResponse()).mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetch);
  await expect(fetchNearbyAccommodations(1, 5, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  await expect(fetchNearbyAccommodations(1)).resolves.toEqual(stays);
  expect(fetch).toHaveBeenCalledTimes(2);
});
