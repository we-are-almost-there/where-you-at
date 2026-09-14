// @vitest-environment jsdom
//
// 홈 '가까운 코스'가 이용자 위치를 서버로 보내지 않는지 본다.
// 위치를 얻으면 위치와 상관없는 출발점 전체 목록만 받고 브라우저에서 고르며,
// 위치를 못 얻으면 기본 목록으로 대체한다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNearbyCourses } from "./homeApi";

function stubGeolocation(coords: { latitude: number; longitude: number } | null) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (onSuccess: PositionCallback, onError: PositionErrorCallback) =>
        coords
          ? onSuccess({ coords } as GeolocationPosition)
          : onError({ code: 1 } as GeolocationPositionError),
    },
  });
}

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

const start = (id: number, title: string, lat: number, lng: number) => ({
  id,
  title,
  start_address: title,
  image_url: null,
  region_code: null,
  routes: [{ route_type: "trail", distance: 10, estimated_time: 120, difficulty: "easy" }],
  start: { lat, lng },
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "geolocation");
});

describe("fetchNearbyCourses", () => {
  it("위치를 얻으면 출발점 목록만 받아 가까운 순으로 고르고, 좌표를 서버로 보내지 않는다", async () => {
    stubGeolocation({ latitude: 37.5665, longitude: 126.978 }); // 서울
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson([start(1, "부산", 35.18, 129.08), start(2, "인천", 37.46, 126.71)]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNearbyCourses(1);

    expect(result.isFallback).toBe(false);
    expect(result.items.map((item) => item.id)).toEqual([2]);
    expect(result.items[0].highlight).toMatch(/^\d+\.\dkm$/);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]).pathname).toBe("/api/courses/starts");
    expect(urls[0]).not.toMatch(/lat|lng|126\.97|37\.56/);
  });

  it("위치를 못 얻으면 기본 목록으로 대체한다", async () => {
    stubGeolocation(null);
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({
        total_count: 1,
        page: 1,
        size: 4,
        courses: [{ id: 5, title: "기본", start_address: null, image_url: null, region_code: null }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNearbyCourses(4);

    expect(result.isFallback).toBe(true);
    expect(result.items.map((item) => item.id)).toEqual([5]);
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe("/api/courses");
  });
});
