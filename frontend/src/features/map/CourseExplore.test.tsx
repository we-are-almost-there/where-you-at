// @vitest-environment jsdom
//
// 코스 탐색 '가까운 순'이 이용자 위치를 서버로 보내지 않고, 필터 결과 전체를 한 번만 받아
// 브라우저에서 정렬·페이지를 나누는지 본다. 페이지를 넘길 때마다 전체를 다시 받던 회귀를 막는다.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "geolocation");
});

describe("CourseExplore 가까운 순", () => {
  it("위치를 얻으면 전체를 받아 가까운 순으로 보여 주고, 요청에 좌표·정렬을 넣지 않는다", async () => {
    const { container } = renderAt("/courses?sort=nearest");

    await waitFor(() => expect(shownIds(container)).toEqual([7, 6, 5, 4, 3, 2]));
    // 보이는 개수와, 응답이 끝난 뒤 화면낭독기에 알리는 상태 문구가 함께 있다.
    const counts = screen.getAllByText("총 7개 코스");
    expect(counts.some((el) => el.getAttribute("role") === "status")).toBe(true);

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

  // 위치 응답이 늦어 기본 순서 1페이지를 먼저 받은 뒤, 전체 목록이 오기 전에 페이지를 넘기는 경우.
  // 요청 page가 1로 고정돼 새 요청이 없으므로, 받아 둔 1페이지를 2페이지인 것처럼 보여 주면 안 된다.
  it("전체 목록이 오기 전에 페이지를 넘기면 이전 페이지 대신 로딩을 보여 주고, 도착하면 그 페이지를 보여 준다", async () => {
    let giveLocation: PositionCallback = () => {};
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (onSuccess: PositionCallback) => {
          giveLocation = onSuccess;
        },
      },
    });
    let resolveAll: (courses: Course[]) => void = () => {};
    vi.mocked(getAllCourses).mockReturnValue(
      new Promise((resolve) => {
        resolveAll = resolve;
      }),
    );

    const { container } = renderAt("/courses?sort=nearest");
    await waitFor(() => expect(shownIds(container)).toEqual([1, 2, 3, 4, 5, 6]));

    act(() => giveLocation({ coords: SEOUL } as GeolocationPosition));
    await waitFor(() => expect(getAllCourses).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(await screen.findByText("코스를 불러오는 중…")).toBeTruthy();
    expect(shownIds(container)).toEqual([]);
    // 기다리는 동안에도 페이지 버튼은 남아 있고, 누른 페이지가 현재 페이지로 표시된다.
    expect(screen.getByRole("button", { name: "2" }).getAttribute("aria-current")).toBe("page");

    await act(async () => resolveAll(ALL));
    await waitFor(() => expect(shownIds(container)).toEqual([1]));
    expect(getAllCourses).toHaveBeenCalledTimes(1);
  });
});

// 방문 혜택 패널의 '이 지역 코스 보러가기'는 늘 5자리 시군구 코드를 넘기는데, 지역 필터
// 항목에는 없을 수 있다 — 코스가 없는 지역이거나(/api/regions가 안 준다), 광역시의 구·군이면
// (드롭다운이 광역시를 하나로 흡수한다) 그렇다. 그때 트리거가 '전체 지역'으로 보이면
// 걸러진 목록을 전체로 읽게 된다 (강화군은 300개 중 4개만 뜬다).
describe("CourseExplore 지역 필터 표시", () => {
  const BUSAN = [
    { region_code: "26110", name: "중구", sido: "부산광역시", is_population_drop: false },
  ];

  // 지역명 로더(lib/regionNames)는 받은 이름을 모듈 캐시에 담는다. 모듈을 다시 불러오지 않으면
  // 앞 테스트가 채운 캐시 때문에 이름 파일을 다시 받지 않아, "받지 않는다"는 단언이 코드와
  // 무관하게 늘 통과한다. 테스트마다 모듈을 새로 불러 첫 조회 상황을 만든다.
  // 모듈을 새로 부르면 vi.mock의 함수도 새로 만들어지므로 목 동작도 새 함수에 심는다.
  let Fresh: typeof CourseExplore;
  let regions: typeof getRegions;

  beforeEach(async () => {
    vi.resetModules();
    const api = await import("./coursesApi");
    regions = api.getRegions;
    vi.mocked(api.getRegions).mockResolvedValue(BUSAN);
    vi.mocked(api.getCourses).mockResolvedValue({
      total_count: ALL.length,
      page: 1,
      size: 6,
      courses: ALL.slice(0, 6),
    });
    vi.mocked(api.getAllCourses).mockResolvedValue(ALL);
    Fresh = (await import("./CourseExplore")).CourseExplore;
    // region-index.json — DB 지역 전체의 이름
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ json: () => Promise.resolve({ names: { "28710": "인천광역시 강화군" } }) }),
      ),
    );
  });

  const renderFresh = (url: string) =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <Fresh />
      </MemoryRouter>,
    );

  // 데스크톱 칩과 모바일 필터가 같이 그려져 트리거는 둘 다 잡힌다
  const regionTriggers = () => screen.getAllByRole("button", { name: "지역" });

  // 이 그룹은 모듈을 새로 불러 CourseExplore를 처음부터 그리고, 지역 목록 → 지역명 파일로
  // 이어지는 두 번의 응답을 기다린다. 전체 테스트가 병렬로 돌며 부하가 걸리면 waitFor 기본
  // 제한(1초)을 넘겨 간헐적으로 실패해 이 그룹의 대기만 늘린다. 공통 시간 제한은 #168에서 다룬다.
  const WAIT_FOR_REGION_LABEL = { timeout: 3000 };

  it("항목에 없는 지역으로 들어오면 그 지역 이름을 필터에 띄운다", async () => {
    renderFresh("/courses?region=28710");

    await waitFor(
      () => regionTriggers().forEach((t) => expect(t.textContent).toContain("인천 강화")),
      WAIT_FOR_REGION_LABEL,
    );
  });

  it("항목에 있는 지역은 그대로 두고 이름 파일을 받지 않는다", async () => {
    renderFresh("/courses?region=26");

    await waitFor(
      () => regionTriggers().forEach((t) => expect(t.textContent).toContain("부산")),
      WAIT_FOR_REGION_LABEL,
    );
    // 항목이 이미 있으므로 이름 파일을 받을 이유가 없다
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("지역 목록이 빈 배열이어도 URL 지역 이름을 필터에 띄운다", async () => {
    vi.mocked(regions).mockResolvedValue([]);

    renderFresh("/courses?region=28710");

    await waitFor(
      () => regionTriggers().forEach((t) => expect(t.textContent).toContain("인천 강화")),
      WAIT_FOR_REGION_LABEL,
    );
  });

  it("지역 목록 재시도를 모두 소진해도 URL 지역 이름을 필터에 띄운다", async () => {
    vi.useFakeTimers();
    const error = new TypeError("Failed to fetch");
    vi.mocked(regions).mockRejectedValue(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    renderFresh("/courses?region=28710");

    // 최초 요청 뒤 5회 재시도한다. 마지막 실패가 옵션을 []로 확정하면 지역명 보완이 시작된다.
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(regions).toHaveBeenCalledTimes(6);
    regionTriggers().forEach((t) => expect(t.textContent).toContain("인천 강화"));
    expect(consoleError).toHaveBeenCalledWith("[CourseExplore] regions fetch failed:", error);

    consoleError.mockRestore();
  });
});
