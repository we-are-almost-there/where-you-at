// coursesApi 테스트 (vitest, fetch mock).
//
// 테스트 범위:
//   - apiGet이 사용자 문구로 바꾸지 않고 에러 종류를 보존하는지
//     - 404면 status가 담긴 HttpError (코스 상세가 "코스를 찾을 수 없어요"를 고르는 근거)
//     - fetch가 연결에 실패하면 NetworkError (toUserError가 연결 실패로 판별하는 근거)
//   - '가까운 순'용 전체 목록·출발점 목록 요청에 이용자 좌표가 들어가지 않는지
//   - 지역 목록 요청이 화면의 경로 이름('도보')을 API 값(type=trail)으로 바꿔 보내는지

import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, NetworkError } from "../../lib/http";
import { getAllCourses, getCourseDetail, getCourseStarts, getRegions } from "./coursesApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("getCourseDetail", () => {
  it("존재하지 않는 코스면 status 404인 HttpError를 throw한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );

    const err = await getCourseDetail(999999).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
  });

  it("fetch가 TypeError로 실패하면 NetworkError를 throw한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(getCourseDetail(1)).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("getAllCourses", () => {
  const listPage = (ids: number[], total: number) =>
    okJson({
      total_count: total,
      page: 1,
      size: 500,
      courses: ids.map((id) => ({ id, title: `코스 ${id}`, start_address: null, image_url: null, region_code: null })),
    });

  it("page를 넘기며 전체를 모으고, 입력에 섞인 정렬·좌표도 보내지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(listPage([1, 2], 3)).mockResolvedValueOnce(listPage([3], 3));
    vi.stubGlobal("fetch", fetchMock);

    // 호출하는 쪽이 실수로 좌표·정렬을 넣어도 요청에서 빠져야 한다.
    const courses = await getAllCourses({
      type: "도보",
      region: "26",
      sort: "nearest",
      lat: "37.5665",
      lng: "126.978",
      page: "4",
      size: "6",
    });

    expect(courses.map((course) => course.id)).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const params = fetchMock.mock.calls.map(([url]) => new URL(String(url)).searchParams);
    expect(params.map((p) => p.get("page"))).toEqual(["1", "2"]);
    for (const p of params) {
      expect(p.get("size")).toBe("500");
      expect(p.get("type")).toBe("trail");
      expect(p.get("region")).toBe("26");
      expect(p.has("sort")).toBe(false);
      expect(p.has("lat")).toBe(false);
      expect(p.has("lng")).toBe(false);
    }
  });
});

describe("getCourseStarts", () => {
  it("출발점 목록을 받아 경로 값을 한국어로 바꾸고 이미지를 https로 올린다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson([
        {
          id: 7,
          title: "해파랑길 1코스",
          start_address: null,
          image_url: "http://tong.visitkorea.or.kr/a.jpg",
          region_code: "26290",
          routes: [{ route_type: "trail", distance: 17.8, estimated_time: 360, difficulty: "medium" }],
          start: { lat: 35.1, lng: 129.1 },
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [course] = await getCourseStarts();

    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe("/api/courses/starts");
    expect(new URL(String(fetchMock.mock.calls[0][0])).search).toBe("");
    expect(course.image_url).toBe("https://tong.visitkorea.or.kr/a.jpg");
    expect(course.routes[0]).toMatchObject({ route_type: "도보", difficulty: "보통" });
    expect(course.start).toEqual({ lat: 35.1, lng: 129.1 });
  });
});

// 방문 혜택 패널은 getRegions("도보")로 코스 링크를 판정한다. 컴포넌트 테스트는 "도보"를
// 넘기는지만, 백엔드 테스트는 type=trail을 받는지만 본다. 그 사이에서 화면의 경로 이름을
// API 값으로 바꾸는 이 연결이 어긋나면 두 쪽 테스트는 모두 통과한 채 판정만 틀어진다.
describe("getRegions", () => {
  const requestedUrl = async (call: () => Promise<unknown>) => {
    const fetchMock = vi.fn().mockResolvedValue(okJson([]));
    vi.stubGlobal("fetch", fetchMock);
    await call();
    return new URL(String(fetchMock.mock.calls[0][0]));
  };

  it("도보는 type=trail로 보낸다", async () => {
    const url = await requestedUrl(() => getRegions("도보"));
    expect(url.pathname).toBe("/api/regions");
    expect(url.searchParams.get("type")).toBe("trail");
  });

  it("자전거는 type=bicycle로 보낸다", async () => {
    const url = await requestedUrl(() => getRegions("자전거"));
    expect(url.searchParams.get("type")).toBe("bicycle");
  });

  it("경로 유형이 없으면 type 없이 보내 전 유형의 코스 보유 지역을 받는다", async () => {
    // 코스 탐색 지역 필터가 쓰는 호출이다. type을 붙이면 기존 필터의 범위가 줄어든다.
    const url = await requestedUrl(() => getRegions());
    expect(url.pathname).toBe("/api/regions");
    expect(url.searchParams.has("type")).toBe(false);
  });
});
