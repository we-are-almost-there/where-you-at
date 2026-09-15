// GET /api/courses/{id}/nearby 호출부(getNearbySpots) 테스트 (vitest, fetch mock).
//
// 테스트 범위:
//   - course가 없어 백엔드가 404를 리턴하면 HttpError(404)를 throw하는지
//   - 코스는 있지만 spots가 없을 때 200 + 빈 배열을 정상 반환하는지
//   - 요청이 지연되어 타임아웃되면 NetworkError로 처리되는지
//   - 응답에 spots가 빠져 변환 중 TypeError가 나도 NetworkError로 바뀌지 않는지
//
// 아래는 이번 수정 범위 밖이라 다루지 않음(추후 nearbyApi 전체 테스트 시 추가):
//   - fromApiSpot의 필드 변환/매핑(camelCase, null -> "" 폴백 등)
//   - category별(attraction/restaurant/accommodation/bicycle) 분기
//   - page/PAGE_SIZE 페이지네이션 동작
//   - getBicycleFacilityDetail, getTourSpotDetail

import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, NetworkError } from "../../lib/http";
import { getNearbySpots } from "./nearbyApi";

describe("getNearbySpots", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("존재하지 않는 코스면 404 HttpError를 throw한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      }),
    );

    const err = await getNearbySpots(999999, "attraction").catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
  });

  it("코스는 있지만 주변 시설이 없으면 빈 배열을 반환한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total_count: 0,
          spots: [],
          list_version: "test-version",
        }),
      }),
    );

    const result = await getNearbySpots(1, "attraction");

    expect(result.totalCount).toBe(0);
    expect(result.spots).toEqual([]);
    expect(result.listVersion).toBe("test-version");
  });

  it("응답이 지연되면 타임아웃을 NetworkError로 처리한다", async () => {
    vi.useFakeTimers();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url, { signal }: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            signal.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );

    const promise = getNearbySpots(1, "attraction");
    const assertion = expect(promise).rejects.toBeInstanceOf(NetworkError);

    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
  });

  it("응답에 spots가 없어 변환 중 난 TypeError는 NetworkError로 바뀌지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          total_count: 0,
        }),
      }),
    );

    const err = await getNearbySpots(1, "attraction").catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(TypeError);
    expect(err).not.toBeInstanceOf(NetworkError);
  });
});
