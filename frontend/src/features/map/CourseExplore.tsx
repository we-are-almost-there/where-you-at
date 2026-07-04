import { useEffect, useMemo, useState } from "react";
import { KakaoMap } from "./KakaoMap";
import { CourseFilters } from "./components/CourseFilters";
import { DifficultyFilter } from "./components/DifficultyFilter";
import { CourseList } from "./components/CourseList";
import { CourseTabs } from "./components/CourseTabs";
import { Pagination } from "./components/Pagination";
import { buildCourseQuery, DEFAULT_PAGE_SIZE, getCoursesMock } from "./coursesMock";
import type { CourseFilterState, LatLng, RouteType } from "./types";

const INITIAL_FILTERS: CourseFilterState = {
  keyword: "",
  region: "",
  distance: "",
  difficulty: "",
  sort: "nearest",
};

export function CourseExplore() {
  const [routeType, setRouteType] = useState<RouteType>("도보");
  const [filters, setFilters] = useState<CourseFilterState>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);

  // '가까운 순' 선택 시에만 위치 권한 요청. 거부/미지원 시 기본 순서로 폴백.
  useEffect(() => {
    if (filters.sort !== "nearest" || userLoc || geoDenied) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoDenied(true),
    );
  }, [filters.sort, userLoc, geoDenied]);

  // 필터 상태 → 쿼리 파라미터 → (Mock) 응답. 5주차엔 getCoursesMock만 실 API로 교체.
  const query = useMemo(
    () => buildCourseQuery(filters, routeType, page, DEFAULT_PAGE_SIZE, userLoc),
    [filters, routeType, page, userLoc],
  );
  const res = useMemo(() => getCoursesMock(query), [query]);
  const totalPages = Math.max(1, Math.ceil(res.total_count / DEFAULT_PAGE_SIZE));

  // 필터·탭 변경 시 1페이지로 리셋
  const changeFilters = (next: CourseFilterState) => {
    setFilters(next);
    setPage(1);
  };
  const changeType = (next: RouteType) => {
    setRouteType(next);
    setPage(1);
  };

  return (
    // 상·하단 고정 앱 레이아웃: 모바일=세로 1열 / md+=목록 + 지도 분할
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-white md:flex-row">
      {/* 코스 목록 영역 */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white md:order-1 md:min-w-0 md:flex-none md:basis-[46%] lg:basis-[44%]">
        {/* 상단바 (모바일 전용, Figma) */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-divider px-4 md:hidden">
          <button type="button" aria-label="메뉴" className="cursor-pointer text-[20px] leading-none text-ink">
            ☰
          </button>
          <span className="font-bold text-ink text-[19px]">어디까지왔니</span>
        </header>

        {/* 제목 + 탭 */}
        <div className="shrink-0 px-4 pb-0 pt-4 md:pt-5">
          <h1 className="font-bold text-ink text-[20px]">코스 목록</h1>
          <div className="mt-3">
            <CourseTabs value={routeType} onChange={changeType} />
          </div>
        </div>

        {/* 필터 + 카드 목록 (상단 고정 아래 영역 내부 스크롤) */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4 md:min-w-0">
          <CourseFilters value={filters} onChange={changeFilters} />
          {/* 코스 수 + 난이도(도보 전용)를 한 줄에 배치 */}
          <div className="mt-3 mb-3 flex items-center justify-between gap-3">
            <p className="text-[13px] text-caption">총 {res.total_count}개 코스</p>
            {routeType === "도보" && (
              <DifficultyFilter
                value={filters.difficulty}
                onChange={(v) => changeFilters({ ...filters, difficulty: v })}
              />
            )}
          </div>
          <CourseList courses={res.courses} routeType={routeType} />
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      </section>

      {/* 지도: md+ 전용, 넓게 차지 */}
      <aside className="hidden md:order-2 md:block md:h-full md:min-w-0 md:flex-1">
        <KakaoMap />
      </aside>
    </div>
  );
}
