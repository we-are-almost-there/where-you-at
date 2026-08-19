import { describe, expect, it } from "vitest";
import {
  buildCourseSearchParams,
  parseCategoryParam,
  parseCourseUrlState,
  parseInfoTabParam,
  parseRouteTypeParam,
  setCategoryParam,
  setInfoTabParam,
  setRouteTypeParam,
} from "./courseUrlState";

describe("courseUrlState", () => {
  it("빈 URL은 기본 목록 상태로 변환한다", () => {
    expect(parseCourseUrlState(new URLSearchParams())).toEqual({
      routeType: "도보",
      filters: { keyword: "", region: "", distance: "", difficulty: "", sort: "nearest" },
      page: 1,
    });
  });

  it("URL 파라미터를 목록 상태로 복원한다", () => {
    const params = new URLSearchParams(
      "type=bicycle&keyword=남파랑길&region=26&distance=long&difficulty=medium&sort=time_asc&page=3",
    );

    expect(parseCourseUrlState(params)).toEqual({
      routeType: "자전거",
      filters: {
        keyword: "남파랑길",
        region: "26",
        distance: "long",
        difficulty: "보통",
        sort: "time_asc",
      },
      page: 3,
    });
  });

  it("잘못된 값은 안전한 기본값으로 대체한다", () => {
    const state = parseCourseUrlState(
      new URLSearchParams("type=car&region=부산&distance=far&difficulty=extreme&sort=random&page=-2"),
    );

    expect(state.routeType).toBe("도보");
    expect(state.filters).toEqual({ keyword: "", region: "", distance: "", difficulty: "", sort: "nearest" });
    expect(state.page).toBe(1);
  });

  it("기본값은 생략하고 변경된 상태만 URL에 기록한다", () => {
    expect(
      buildCourseSearchParams({
        routeType: "도보",
        filters: { keyword: "", region: "", distance: "", difficulty: "", sort: "nearest" },
        page: 1,
      }).toString(),
    ).toBe("");

    expect(
      buildCourseSearchParams({
        routeType: "자전거",
        filters: {
          keyword: "해안 길",
          region: "26000",
          distance: "short",
          difficulty: "쉬움",
          sort: "distance_asc",
        },
        page: 2,
      }).toString(),
    ).toBe("type=bicycle&keyword=%ED%95%B4%EC%95%88+%EA%B8%B8&region=26000&distance=short&difficulty=easy&sort=distance_asc&page=2");
  });
});

describe("routeTypeParam", () => {
  it("상세 화면의 주행 방식을 URL과 양방향 변환한다", () => {
    const params = new URLSearchParams("type=bicycle");
    expect(parseRouteTypeParam(params)).toBe("자전거");

    setRouteTypeParam(params, "도보");
    expect(params.toString()).toBe("");
    expect(parseRouteTypeParam(params)).toBe("도보");
  });
});


describe("infoTabParam", () => {
  it("파라미터가 없으면 코스 정보를 기본값으로 반환한다", () => {
    expect(parseInfoTabParam(new URLSearchParams())).toBe("course");
  });

  it("tab=nearby를 주변 정보로 읽는다", () => {
    expect(parseInfoTabParam(new URLSearchParams("tab=nearby"))).toBe("nearby");
  });

  it("알 수 없는 값은 코스 정보로 대체한다", () => {
    expect(parseInfoTabParam(new URLSearchParams("tab=invalid"))).toBe("course");
  });

  it("주변 정보로 전환하면 tab 파라미터를 기록한다", () => {
    const params = new URLSearchParams();
    setInfoTabParam(params, "nearby");
    expect(params.toString()).toBe("tab=nearby");
  });

  it("코스 정보로 돌아가면 tab과 category 파라미터를 모두 지운다", () => {
    const params = new URLSearchParams("tab=nearby&category=restaurant");
    setInfoTabParam(params, "course");
    expect(params.toString()).toBe("");
  });
});

describe("categoryParam", () => {
  it("파라미터가 없으면 관광지를 기본값으로 반환한다", () => {
    expect(parseCategoryParam(new URLSearchParams())).toBe("attraction");
  });

  it("URL의 카테고리 값을 그대로 읽는다", () => {
    expect(parseCategoryParam(new URLSearchParams("category=restaurant"))).toBe("restaurant");
    expect(parseCategoryParam(new URLSearchParams("category=accommodation"))).toBe("accommodation");
    expect(parseCategoryParam(new URLSearchParams("category=bicycle"))).toBe("bicycle");
  });

  it("알 수 없는 값은 관광지로 대체한다", () => {
    expect(parseCategoryParam(new URLSearchParams("category=invalid"))).toBe("attraction");
  });

  it("기본값(관광지)으로 설정하면 파라미터를 생략한다", () => {
    const params = new URLSearchParams("category=restaurant");
    setCategoryParam(params, "attraction");
    expect(params.toString()).toBe("");
  });

  it("기본값이 아닌 카테고리는 파라미터로 기록한다", () => {
    const params = new URLSearchParams();
    setCategoryParam(params, "bicycle");
    expect(params.toString()).toBe("category=bicycle");
  });
});
