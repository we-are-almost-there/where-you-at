import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { KakaoMap, type CourseMapItem } from "./KakaoMap";
import {
  CourseFilterChips,
  CourseKeywordSearch,
  CourseMobileFilters,
  CourseSortFilter,
} from "./components/CourseFilters";
import { DifficultyFilter } from "./components/DifficultyFilter";
import { CourseGroupPicker } from "./components/CourseGroupPicker";
import { CourseList } from "./components/CourseList";
import { CourseTabs } from "./components/CourseTabs";
import { courseTabPanelProps } from "./components/courseTabItems";
import { StatusMessage } from "../../components/common/a11y";
import { smoothScrollBehavior } from "../../lib/motion";
import { Pagination } from "./components/Pagination";
import { ErrorNotice } from "../../components/error/ErrorNotice";
import { toUserError, type UserError } from "../../components/error/userError";
import { buildCourseQuery, DEFAULT_PAGE_SIZE } from "./coursesMock";
import { getAllCourses, getCourses, getRegions } from "./coursesApi";
import { slicePage, sortByDistance } from "./nearestSort";
import {
  buildRegionOptions,
  hasRegionOption,
  regionOptionLabel,
  type RegionSelectItem,
} from "./regionOptions";
import { loadRegionNames } from "../../lib/regionNames";
import type { Course, CourseFilterState, CourseListResponse, LatLng, RouteType } from "./types";
import { buildCourseSearchParams, parseCourseUrlState, type CourseUrlState } from "./courseUrlState";
import AppHeader from "../../components/layout/AppHeader";
import { MAIN_CONTENT_ID } from "../../components/layout/mainContent";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

const EMPTY_RES: CourseListResponse = {
  total_count: 0,
  page: 1,
  size: DEFAULT_PAGE_SIZE,
  courses: [],
};

/** 서버가 페이지를 나눠 준 응답이거나, '가까운 순'을 위해 받은 필터 결과 전체. */
type FetchedCourses = { mode: "page"; res: CourseListResponse } | { mode: "all"; courses: Course[] };

/** 가까운 순 기준점. 지금 탭 경로의 출발점(썸네일 경로의 첫 점), 없으면 가진 경로의 출발점. */
function courseStart(course: Course, routeType: RouteType): LatLng | null {
  const primary = routeType === "자전거" ? course.path_bicycle : course.path_trail;
  return primary[0] ?? course.path_trail[0] ?? course.path_bicycle[0] ?? null;
}

export function CourseExplore() {
  useDocumentTitle("코스 탐색");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { routeType, filters, page } = useMemo(() => parseCourseUrlState(searchParams), [searchParams]);
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  // /api/regions가 준 항목(코스 보유 지역만). 화면에 넘기는 목록은 아래 regionOptions다.
  // null은 아직 /api/regions 결과를 모르는 상태다. []와 합치면 정상 빈 응답이나
  // 재시도 소진도 계속 "조회 전"으로 남아, URL 지역을 임시 항목으로 보완하지 못한다.
  const [courseRegionOptions, setCourseRegionOptions] = useState<RegionSelectItem[] | null>(null);
  const [regionNames, setRegionNames] = useState<Map<string, string> | null>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [mapLeftInset, setMapLeftInset] = useState(0);

  // 데스크톱 지도에서 패널이 실제로 덮는 폭을 잰다. 패널 폭이 clamp와 창 크기에 따라
  // 달라지므로 CSS 수치를 JS에 한 번 더 하드코딩하지 않는다.
  useEffect(() => {
    const layout = layoutRef.current;
    const panel = panelRef.current;
    if (!layout || !panel) return;

    const measure = () => {
      if (window.getComputedStyle(panel).position !== "absolute") {
        setMapLeftInset(0);
        return;
      }
      const layoutBox = layout.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const next = Math.max(0, Math.ceil(panelBox.right - layoutBox.left + 16));
      setMapLeftInset((current) => (current === next ? current : next));
    };

    const observer = new ResizeObserver(measure);
    observer.observe(layout);
    observer.observe(panel);
    measure();
    return () => observer.disconnect();
  }, []);

  // 지역 필터 옵션 로드. 코스와 달리 재조회 트리거가 없으므로, 마운트 시점에
  // 백엔드가 아직 안 떠 있으면 영구히 빈 필터가 된다. 실패 시 짧게 재시도해 자가 복구한다.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = () => {
      getRegions()
        .then((rs) => !cancelled && setCourseRegionOptions(buildRegionOptions(rs)))
        .catch((err) => {
          if (cancelled) return;
          // 재시도가 남았으면 조용히 다시 시도하고, 다 소진되면 원인 추적용으로 한 줄 남긴다.
          if (attempts++ < 5) timer = setTimeout(load, 1500);
          else {
            // 재시도를 다 썼으면 "조회 완료·항목 없음"으로 정착시킨다. 그래야 URL에
            // 지역이 있을 때 region-index.json의 이름으로 현재 필터를 계속 드러낼 수 있다.
            setCourseRegionOptions([]);
            console.error("[CourseExplore] regions fetch failed:", err);
          }
        });
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // URL의 지역이 드롭다운 항목에 없을 수 있다.
  //   - 코스가 없는 지역 — /api/regions는 코스를 가진 지역만 준다
  //   - 광역시의 구·군 — 드롭다운이 광역시를 시도 하나로 흡수해 5자리 항목이 없다
  // 방문 혜택 패널의 '이 지역 코스 보러가기'가 늘 5자리 코드를 넘기므로 둘 다 실제로 들어온다.
  // 항목이 없으면 트리거는 '전체 지역'으로 보이는데 목록은 걸러진 채다 — 강화군으로 들어오면
  // 300개 중 4개만 뜨는데 필터는 전체라고 적혀 있고, 코스가 없는 지역이면 왜 비었는지 알 수 없다.
  // 지역명을 찾아 항목을 하나 얹어, 지금 무엇으로 걸러졌는지 드러낸다.
  const unknownRegion =
    filters.region !== "" &&
    courseRegionOptions !== null &&
    !hasRegionOption(courseRegionOptions, filters.region)
      ? filters.region
      : null;

  useEffect(() => {
    if (!unknownRegion) return;
    let cancelled = false;
    // 이름을 못 받으면 항목을 얹지 않는다 — 코드만 적힌 항목은 '전체 지역'보다 나을 게 없다.
    loadRegionNames()
      .then((names) => {
        if (!cancelled) setRegionNames(names);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [unknownRegion]);

  const regionOptions = useMemo(() => {
    if (courseRegionOptions === null) return [];
    if (!unknownRegion) return courseRegionOptions;
    const full = regionNames?.get(unknownRegion);
    return full
      ? [...courseRegionOptions, { value: unknownRegion, label: regionOptionLabel(full) }]
      : courseRegionOptions;
  }, [courseRegionOptions, unknownRegion, regionNames]);

  // 페이지 이동 시 목록 스크롤을 맨 위로 (다음 페이지의 첫 코스가 보이도록)
  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [page]);

  // '가까운 순' 선택 시에만 위치 권한 요청. 거부/미지원 시 기본 순서로 폴백.
  useEffect(() => {
    if (filters.sort !== "nearest" || userLoc || geoDenied) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoDenied(true),
    );
  }, [filters.sort, userLoc, geoDenied]);

  // '가까운 순'이고 위치를 얻었으면 필터에 맞는 코스 전체를 받아 브라우저에서 정렬한다.
  // 이용자 위치를 서버로 보내지 않기 위해서다(nearestSort.ts). 위치를 아직 못 얻었거나 거부했으면 기본 순서다.
  const nearestOrigin = filters.sort === "nearest" ? userLoc : null;

  // 필터 상태 → 쿼리 파라미터 → 실제 /api/courses 응답.
  // 전체를 받을 때는 화면에서 페이지를 나누므로 page를 1로 고정해, 페이지를 넘겨도 다시 요청하지 않는다.
  const query = useMemo(
    () => buildCourseQuery(filters, routeType, nearestOrigin ? 1 : page, DEFAULT_PAGE_SIZE),
    [filters, routeType, page, nearestOrigin],
  );
  // 재조회 여부는 query의 값으로 비교한다. 페이지를 넘기면 URL이 바뀌어 filters·query가 값은 같아도
  // 새 객체로 만들어지는데, 객체 참조로 비교하면 '가까운 순'에서도 페이지마다 전체를 다시 받는다.
  // 같은 query라도 받는 방식(한 페이지 / 전체)이 달라서 위치 유무도 키에 넣는다(BicycleExplore와 같은 방식).
  const queryKey = useMemo(() => JSON.stringify([nearestOrigin != null, query]), [query, nearestOrigin]);
  const [fetched, setFetched] = useState<FetchedCourses>({ mode: "page", res: EMPTY_RES });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UserError | null>(null);
  const [retryTick, setRetryTick] = useState(0); // '다시 시도' 트리거

  // 쿼리 변경 시 재조회. stale-while-revalidate: 새 응답이 올 때까지 기존 목록을 유지한다.
  useEffect(() => {
    let cancelled = false;
    const request: Promise<FetchedCourses> = nearestOrigin
      ? getAllCourses(query).then((courses) => ({ mode: "all", courses }))
      : getCourses(query).then((r) => ({ mode: "page", res: r }));
    request
      .then((result) => {
        if (cancelled) return;
        setFetched(result);
        setError(null);
      })
      .catch((e) => !cancelled && setError(toUserError(e, "코스를 불러오지 못했어요")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // query·nearestOrigin 대신 둘을 값으로 묶은 queryKey로 변경 여부를 비교한다(위 queryKey 주석 참고).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, retryTick]);

  // 전체를 받았으면 가까운 순으로 정렬한다. 정렬은 목록·위치·탭이 바뀔 때만 다시 하고, 페이지 이동은 자르기만 한다.
  const sortedAll = useMemo(() => {
    if (fetched.mode !== "all") return null;
    // 다른 정렬로 바꾼 직후 새 응답을 기다리는 동안에는 받은 순서 그대로 보여 준다.
    if (!nearestOrigin) return fetched.courses;
    return sortByDistance(fetched.courses, nearestOrigin, (course) => courseStart(course, routeType));
  }, [fetched, nearestOrigin, routeType]);

  const res = useMemo<CourseListResponse>(() => {
    if (!sortedAll) return fetched.mode === "page" ? fetched.res : EMPTY_RES;
    return {
      total_count: sortedAll.length,
      page,
      size: DEFAULT_PAGE_SIZE,
      courses: slicePage(sortedAll, page, DEFAULT_PAGE_SIZE),
    };
  }, [sortedAll, fetched, page]);

  // 받아 둔 한 페이지 응답이 지금 페이지와 다르면 그 목록을 보여 주지 않고 로딩으로 둔다.
  // '가까운 순'에서 전체 목록을 받는 중에 페이지를 넘기면 요청 page가 1로 고정돼 새 요청이 없어서,
  // 그대로 두면 전체 목록이 올 때까지 페이지 번호만 바뀌고 카드는 이전 페이지로 남는다.
  // 일반 페이지 이동에서도 새 응답이 오기 전까지 같은 어긋남이 생겨 함께 막는다.
  // 2페이지 이상에서 필터를 바꿔 1페이지로 돌아갈 때도 받아 둔 목록이 1페이지가 아니라서 로딩으로 둔다.
  const pageMismatch = fetched.mode === "page" && fetched.res.page !== page;

  // 이벤트 핸들러에서 로딩 표시 후 재조회 트리거 (effect 안 setState 아님)
  const retry = () => {
    setLoading(true);
    setError(null);
    setRetryTick((t) => t + 1);
  };

  const totalPages = Math.max(1, Math.ceil(res.total_count / DEFAULT_PAGE_SIZE));

  // 지금 짚고 있는 코스들과 그 출처. 카드 강조(테두리)는 지도 쪽에서 짚었을 때만 필요하므로
  // id만으로는 부족하고 어디서 왔는지를 같이 들고 있어야 한다.
  // ids가 복수인 경우: DMZ 본코스와 우회로처럼 시작점이 포개진 마커를 짚었을 때. 마커 하나로는
  // 둘 중 어느 쪽인지 정할 수 없으므로 둘 다 켠다(선을 짚으면 하나로 좁혀진다).
  const [hovered, setHovered] = useState<{ ids: number[]; from: "card" | "map" } | null>(null);

  // 시작점이 포개진 마커를 눌러 고르는 중인 코스들. hover와 달리 커서가 떠나도 남아 있어야 하므로
  // 별도 상태로 두고, 열려 있는 동안에는 hover보다 이쪽을 우선한다.
  const [picked, setPicked] = useState<{ ids: number[]; index: number } | null>(null);
  const pickedId = picked ? picked.ids[picked.index] : null;

  // 현재 페이지 결과를 지도용으로 변환. 좌표(path_*)는 목록 응답에 이미 담겨 오므로 추가 요청이 없다.
  const mapCourses = useMemo<CourseMapItem[]>(
    () =>
      res.courses.map((c) => ({
        id: c.id,
        title: c.title,
        points: routeType === "자전거" ? c.path_bicycle : c.path_trail,
        // 카드와 같은 기준으로 고른다 — 지금 탭의 주행 방식, 없으면 가진 것 중 첫 번째.
        distanceKm: (c.routes.find((r) => r.route_type === routeType) ?? c.routes[0]).distance,
      })),
    [res.courses, routeType],
  );

  const openCourse = (id: number) => {
    navigate(`/courses/${id}${routeType === "자전거" ? "?type=bicycle" : ""}`);
  };

  // 목록에서 사라진 코스를 계속 짚고 있지 않도록, 현재 페이지에 있는 id만 유효로 본다.
  // (마커에 커서를 올린 채로 목록이 갱신되면 mouseout이 오지 않아 id가 남는다)
  // hover가 살아 있으면 그쪽이 이긴다 — 고른 코스를 열어둔 채로 다른 마커를 잠깐 훑어볼 수 있고,
  // 커서를 떼면 다시 고른 코스로 돌아온다.
  const activeCourseIds = useMemo(() => {
    const ids = hovered ? hovered.ids : pickedId != null ? [pickedId] : [];
    return ids.filter((id) => mapCourses.some((c) => c.id === id));
  }, [hovered, pickedId, mapCourses]);
  // 카드 테두리는 '지도가 이 카드를 가리키는 중'이라는 신호이므로, 카드 자신을 hover할 때는 빼야 한다.
  // 코스가 하나로 정해질 때만 켠다. 시작점이 포개져 여럿이 잡혔을 땐 카드가 한 장씩만 화면에
  // 들어와(패널 525px에 카드 250px) 그중 하나만 테두리가 보이는데, 그러면 라벨은 여러 개라고
  // 하는데 목록은 하나를 가리키는 꼴이 된다. 그때는 목록을 건드리지 않고 지도가 답한다.
  const pointedFromMap = hovered ? hovered.from === "map" : pickedId != null;
  const mapPointedIds = pointedFromMap && activeCourseIds.length === 1 ? activeCourseIds : [];
  // 지도를 옮기는 건 카드에서 짚었고 대상이 하나로 정해졌을 때만.
  const focusCourseId = hovered?.from === "card" && activeCourseIds.length === 1 ? activeCourseIds[0] : null;

  const scrollCardIntoView = (id: number) => {
    const scroller = listScrollRef.current;
    const card = scroller?.querySelector(`[data-course-id="${id}"]`);
    if (!scroller || !card) return;
    // 이미 다 보이는 카드는 건드리지 않는다. 마커가 촘촘히 붙어 있어 커서가 여러 개를 스치고
    // 지나갈 때, 매번 스크롤을 걸면 목록이 계속 덜컹거린다.
    const view = scroller.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    if (box.top >= view.top && box.bottom <= view.bottom) return;
    card.scrollIntoView({ block: "nearest", behavior: smoothScrollBehavior() });
  };

  // 지도 → 목록 방향 매칭. 마커는 시작점이 포개진 코스를 한꺼번에(지도가 묶어서 넘겨준다),
  // 선은 경로가 갈라지므로 하나만 짚는다.
  // (카드 → 지도 방향은 카드 자신의 hover가 처리하므로 여기서 스크롤하면 안 된다 — 목록이 계속 흔들린다.)
  const handleMapHover = (ids: number[]) => {
    if (ids.length === 0) {
      setHovered(null);
      return;
    }
    setHovered({ ids, from: "map" });
    // 코스가 하나로 정해질 때만 목록을 옮긴다. 시작점이 포개져 여럿이 잡혔을 땐 첫 번째로만
    // 스크롤하게 되는데, 나머지가 화면 밖이면 어디 있는지 알 수 없어 오히려 헷갈린다.
    // 그때는 목록에 답을 미루지 않고 지도가 답한다 — 잡힌 코스의 경로선이 함께 진해진다.
    if (ids.length === 1) scrollCardIntoView(ids[0]);
  };

  // 결과가 바뀌면(필터·페이지·탭) 카드가 가리키던 코스는 더 이상 화면에 없다.
  const [pickedBaseline, setPickedBaseline] = useState(res.courses);
  if (pickedBaseline !== res.courses) {
    setPickedBaseline(res.courses);
    if (picked) setPicked(null);
  }
  // 카드가 넘겨 보는 실제 대상. index는 이 배열 기준이라 목록 스크롤도 여기서 뽑아 쓴다.
  const pickedCourses = picked
    ? picked.ids.flatMap((id) => res.courses.filter((c) => c.id === id))
    : [];

  // 시작점이 포개진 마커 클릭 — 지도를 확대해 갈라놓는 대신 그 자리의 코스를 카드로 넘겨 본다.
  const pickGroup = (ids: number[]) => {
    // 지금 페이지에 있는 코스만 담아 두면 ids와 pickedCourses의 순서·길이가 어긋나지 않는다.
    const valid = ids.filter((id) => res.courses.some((c) => c.id === id));
    if (valid.length < 2) return;
    setPicked({ ids: valid, index: 0 });
    scrollCardIntoView(valid[0]);
  };
  const pickIndex = (index: number) => {
    if (!picked) return;
    setPicked({ ...picked, index });
    const next = pickedCourses[index];
    if (next) scrollCardIntoView(next.id);
  };

  const updateUrlState = (next: CourseUrlState, replace = false) => {
    setSearchParams(buildCourseSearchParams(next), { replace });
  };

  // 공유 URL의 page가 현재 필터 결과 범위를 벗어나면 마지막 유효 페이지로 교정한다.
  useEffect(() => {
    if (loading || error || res.total_count === 0 || page <= totalPages) return;
    setSearchParams(buildCourseSearchParams({ routeType, filters, page: totalPages }), { replace: true });
  }, [loading, error, res.total_count, page, totalPages, routeType, filters, setSearchParams]);

  // 필터·탭 변경 시 1페이지로 리셋
  const changeFilters = (next: CourseFilterState) => {
    const keywordOnly =
      next.keyword !== filters.keyword &&
      next.region === filters.region &&
      next.distance === filters.distance &&
      next.difficulty === filters.difficulty &&
      next.sort === filters.sort;
    updateUrlState({ routeType, filters: next, page: 1 }, keywordOnly);
  };
  const changeType = (next: RouteType) => {
    updateUrlState({ routeType: next, filters, page: 1 });
  };

  return (
    // 모바일은 기존 목록 화면, md 이상은 전체 지도 위에 목록 패널을 띄운다.
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-white">
      <AppHeader />

      <main ref={layoutRef} id={MAIN_CONTENT_ID} tabIndex={-1} className="relative flex min-h-0 flex-1 outline-none">
        {/* 지도: md+ 전용, 상단바 아래 영역을 채우는 배경 */}
        <aside className="hidden md:absolute md:inset-0 md:block">
          <KakaoMap
            courses={mapCourses}
            activeCourseIds={activeCourseIds}
            focusCourseId={focusCourseId}
            leftInset={mapLeftInset}
            onCourseClick={openCourse}
            onCourseGroupClick={pickGroup}
            pickedCourseId={pickedId}
            pickedCard={
              pickedCourses.length > 1 && picked ? (
                <CourseGroupPicker
                  courses={pickedCourses}
                  index={picked.index}
                  routeType={routeType}
                  onIndexChange={pickIndex}
                  onSelect={(course) => openCourse(course.id)}
                  onClose={() => setPicked(null)}
                />
              ) : null
            }
            onCourseMarkerHover={handleMapHover}
            onCourseLineHover={(id) => handleMapHover(id == null ? [] : [id])}
          />
        </aside>

        {/* 코스 목록 영역 */}
        <section
          ref={panelRef}
          className="z-20 flex min-h-0 flex-1 flex-col overflow-hidden bg-white md:absolute md:bottom-4 md:left-4 md:top-4 md:w-[clamp(20rem,36vw,24rem)] md:flex-none md:rounded-2xl md:shadow-[0_8px_28px_rgba(0,0,0,0.2)]"
        >
          {/* 제목 + 탭 */}
          <div className="shrink-0 px-4 pb-0 pt-4 md:pt-5">
            <h1 className="font-bold text-ink text-[20px]">코스 목록</h1>
            <div className="mt-3">
              <CourseTabs value={routeType} onChange={changeType} />
            </div>
          </div>

          {/* 필터 + 카드 목록 (상단 고정 아래 영역 내부 스크롤) */}
          <div ref={listScrollRef} {...courseTabPanelProps(routeType)} className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4 md:min-w-0">
            <CourseKeywordSearch value={filters} onChange={changeFilters} />
            <div className="mt-2.5 md:hidden">
              <CourseMobileFilters
                value={filters}
                onChange={changeFilters}
                regionOptions={regionOptions}
              />
            </div>
            {/* 코스 수 + 데스크톱 정렬 / 모바일 난이도 */}
            <div className="mt-3 mb-3 flex items-center justify-between gap-3">
              {/* 보이는 개수는 새 결과가 오기 전까지 이전 값이라, 화면낭독기에는 응답이 끝난 뒤의 값만 알린다.
                검색어는 입력이 멈춘 뒤(250ms)에야 요청되므로 글자마다 읽지 않는다. */}
              <p className="text-[13px] text-caption">총 {res.total_count}개 코스</p>
              <StatusMessage
                message={
                  error ? "" : loading || pageMismatch ? "코스를 불러오는 중" : `총 ${res.total_count}개 코스`
                }
              />
              <div className="hidden md:block">
                <CourseSortFilter value={filters} onChange={changeFilters} />
              </div>
              {routeType === "도보" && (
                <div className="md:hidden">
                  <DifficultyFilter
                    value={filters.difficulty}
                    onChange={(next) => changeFilters({ ...filters, difficulty: next })}
                  />
                </div>
              )}
            </div>
            {error ? (
              <ErrorNotice
                title={error.title}
                description={error.description}
                onRetry={retry}
              />
            ) : loading || pageMismatch ? (
              <p className="py-16 text-center text-[14px] text-caption">코스를 불러오는 중…</p>
            ) : (
              <CourseList
                courses={res.courses}
                routeType={routeType}
                onSelect={(course) => openCourse(course.id)}
                onHover={(id) => setHovered(id == null ? null : { ids: [id], from: "card" })}
                activeIds={mapPointedIds}
              />
            )}
            {/* 페이지를 넘겨 새 목록을 기다리는 동안에도 페이지 버튼을 남겨, 버튼이 사라졌다 나타나며 화면이 흔들리지 않게 한다.
              첫 로딩에는 전체 개수가 0이라 Pagination이 그리지 않는다(BicycleExplore와 같은 배치). */}
            {!error && (
              <Pagination
                page={page}
                totalPages={totalPages}
                onChange={(nextPage) => updateUrlState({ routeType, filters, page: nextPage })}
              />
            )}
          </div>
        </section>

        {/* 데스크톱 필터: 검색창은 패널에 두고 선택 필터만 지도 위에 띄운다. */}
        <div
          className="pointer-events-none absolute right-4 top-4 z-10 hidden md:block [&>*]:pointer-events-auto"
          style={{ left: mapLeftInset }}
        >
          <CourseFilterChips
            value={filters}
            onChange={changeFilters}
            regionOptions={regionOptions}
            showDifficulty={routeType === "도보"}
          />
        </div>
      </main>
    </div>
  );
}
