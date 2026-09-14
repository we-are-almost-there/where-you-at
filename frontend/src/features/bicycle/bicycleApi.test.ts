// '가까운 순'용 전체 목록 요청에 이용자 좌표가 들어가지 않는지 본다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAllBicycleFacilities } from "./bicycleApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

const facility = (id: number) => ({
  id,
  facility_title: `대여소 ${id}`,
  addr1: null,
  map_x: 127,
  map_y: 37,
  facility_type: "rental_unmanned",
  rental_fee_type: null,
  repair_available: null,
  open_hours: null,
  total_bikes: null,
  available_bikes: 3,
  region_code: null,
  realtime_synced_at: null,
});

const listPage = (ids: number[], total: number) => ({
  ok: true,
  status: 200,
  json: async () => ({ total_count: total, page: 1, size: 5000, facilities: ids.map(facility) }),
});

describe("getAllBicycleFacilities", () => {
  it("page를 넘기며 전체를 모으고, 입력에 섞인 정렬·좌표도 보내지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(listPage([1, 2], 3)).mockResolvedValueOnce(listPage([3], 3));
    vi.stubGlobal("fetch", fetchMock);

    // 호출하는 쪽이 실수로 좌표·정렬을 넣어도 요청에서 빠져야 한다.
    const facilities = await getAllBicycleFacilities({
      data_source: "realtime",
      region: "11",
      sort: "nearest",
      lat: "37.5665",
      lng: "126.978",
      page: "3",
      size: "20",
    });

    expect(facilities.map((f) => f.id)).toEqual([1, 2, 3]);
    const params = fetchMock.mock.calls.map(([url]) => new URL(String(url)).searchParams);
    expect(params.map((p) => p.get("page"))).toEqual(["1", "2"]);
    for (const p of params) {
      expect(p.get("size")).toBe("5000");
      expect(p.get("data_source")).toBe("realtime");
      expect(p.get("region")).toBe("11");
      expect(p.has("sort")).toBe(false);
      expect(p.has("lat")).toBe(false);
      expect(p.has("lng")).toBe(false);
    }
  });
});
