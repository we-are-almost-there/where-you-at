// @vitest-environment jsdom
//
// 코스 탐색 '가까운 순'이 이용자 위치를 서버로 보내지 않고, 필터 결과 전체를 한 번만 받아
// 브라우저에서 정렬·페이지를 나누는지 본다. 페이지를 넘길 때마다 전체를 다시 받던 회귀를 막는다.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseExplore } from "./CourseExplore";
import { getAllCourses, getCourses, getRegions } from "./coursesApi";
import type { Course } from "./types";

vi.mock("./coursesApi", () => ({ getAllCourses: vi.fn(), getCourses: vi.fn(), getRegions: vi.fn() }));
// 지도와 상단바는 카카오 SDK·브라우저 API를 써서 jsdom에서 그릴 수 없고, 이 테스트의 대상도 아니다.
vi.mock("./KakaoMap", () => ({ KakaoMap: () => null }));
vi.mock("../../components/layout/AppHeader", () => ({ default: () => null }));

const SEOUL = { latitude: 37.5665, longitude: 126.978 };

// id가 클수록 서울에 가깝다. 서버 기본 순서(id)와 가까운 순이 반대가 되게 둔다.
const course = (id: number): Course => {
  const lat = SEOUL.latitude + (8 - id) * 0.1;
  return {
    id,
    title: `코스 ${id}`,
    start_address: "",
    image_url: "",
    region_code: "",
    is_population_drop_zone: false,
    landmarks: [],
    routes: [{ route_type: "도보", distance: 10, estimated_time: 120, difficulty: "쉬움" }],
    path_trail: [
      { lat, lng: SEOUL.longitude },
      { lat: lat + 0.01, lng: SEOUL.longitude },
    ],
    path_bicycle: [],
  };
};

const ALL = [1, 2, 3, 4, 5, 6, 7].map(course);

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CourseExplore />
    </MemoryRouter>,
  );
}

const shownIds = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-course-id]")).map((el) => Number(el.getAttribute("data-course-id")));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollTo = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: (onSuccess: PositionCallback) => onSuccess({ coords: SEOUL } as GeolocationPosition) },
  });
  vi.mocked(getRegions).mockResolvedValue([]);
  vi.mocked(getCourses).mockResolvedValue({ total_count: ALL.length, page: 1, size: 6, courses: ALL.slice(0, 6) });
  vi.mocked(getAllCourses).mockResolvedValue(ALL);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "geolocation");
});

describe("CourseExplore 가까운 순", () => {
  it("위치를 얻으면 전체를 받아 가까운 순으로 보여 주고, 요청에 좌표·정렬을 넣지 않는다", async () => {
    const { container } = renderAt("/courses?sort=nearest");

    await waitFor(() => expect(shownIds(container)).toEqual([7, 6, 5, 4, 3, 2]));
    expect(screen.getByText("총 7개 코스")).toBeTruthy();

    expect(getAllCourses).toHaveBeenCalledTimes(1);
    const query = vi.mocked(getAllCourses).mock.calls[0][0];
    expect(query).not.toHaveProperty("lat");
    expect(query).not.toHaveProperty("lng");
    expect(query).not.toHaveProperty("sort");
  });

  it("페이지를 넘겨도 전체를 다시 받지 않는다", async () => {
    const { container } = renderAt("/courses?sort=nearest");
    await waitFor(() => expect(shownIds(container)).toEqual([7, 6, 5, 4, 3, 2]));

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    await waitFor(() => expect(shownIds(container)).toEqual([1]));
    expect(getAllCourses).toHaveBeenCalledTimes(1);
  });
});
