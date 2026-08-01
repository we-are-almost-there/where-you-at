import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { KakaoMap } from "./KakaoMap";
import { CourseFilters } from "./components/CourseFilters";
import { DifficultyFilter } from "./components/DifficultyFilter";
import { CourseList } from "./components/CourseList";
import { CourseTabs } from "./components/CourseTabs";
import { Pagination } from "./components/Pagination";
import { ErrorNotice, CONNECTION_ERROR_TITLE, CONNECTION_ERROR_DESC } from "./components/ErrorNotice";
import { buildCourseQuery, DEFAULT_PAGE_SIZE } from "./coursesMock";
import { getCourses, getRegions } from "./coursesApi";
import { buildRegionOptions, type RegionSelectItem } from "./regionOptions";
import type { CourseFilterState, CourseListResponse, LatLng, RouteType } from "./types";
import { buildCourseSearchParams, parseCourseUrlState, type CourseUrlState } from "./courseUrlState";
import AppHeader from "../../components/layout/AppHeader";

const EMPTY_RES: CourseListResponse = {
  total_count: 0,
  page: 1,
  size: DEFAULT_PAGE_SIZE,
  courses: [],
};

export function CourseExplore() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { routeType, filters, page } = useMemo(() => parseCourseUrlState(searchParams), [searchParams]);
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [regionOptions, setRegionOptions] = useState<RegionSelectItem[]>([]);
  const listScrollRef = useRef<HTMLDivElement>(null);

  // 지역 필터 옵션 로드. 코스와 달리 재조회 트리거가 없으므로, 마운트 시점에
  // 백엔드가 아직 안 떠 있으면 영구히 빈 필터가 된다. 실패 시 짧게 재시도해 자가 복구한다.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = () => {
      getRegions()
        .then((rs) => !cancelled && setRegionOptions(buildRegionOptions(rs)))
        .catch((err) => {
          if (cancelled) return;
          // 재시도가 남았으면 조용히 다시 시도하고, 다 소진되면 원인 추적용으로 한 줄 남긴다.
          if (attempts++ < 5) timer = setTimeout(load, 1500);
          else console.error("[CourseExplore] regions fetch failed:", err);
        });
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

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

  // 필터 상태 → 쿼리 파라미터 → 실제 /api/courses 응답.
  const query = useMemo(
    () => buildCourseQuery(filters, routeType, page, DEFAULT_PAGE_SIZE, userLoc),
    [filters, routeType, page, userLoc],
  );
  const [res, setRes] = useState<CourseListResponse>(EMPTY_RES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0); // '다시 시도' 트리거

  // 쿼리 변경 시 재조회. stale-while-revalidate: 새 응답이 올 때까지 기존 목록을 유지한다.
  useEffect(() => {
    let cancelled = false;
    getCourses(query)
      .then((r) => {
        if (cancelled) return;
        setRes(r);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "코스를 불러오지 못했어요"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, retryTick]);

  // 이벤트 핸들러에서 로딩 표시 후 재조회 트리거 (effect 안 setState 아님)
  const retry = () => {
    setLoading(true);
    setError(null);
    setRetryTick((t) => t + 1);
  };

  const totalPages = Math.max(1, Math.ceil(res.total_count / DEFAULT_PAGE_SIZE));

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
    // 상·하단 고정 앱 레이아웃: 모바일=세로 1열 / md+=목록 + 지도 분할
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-white md:flex-row">
      {/* 코스 목록 영역 */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white md:order-1 md:min-w-0 md:flex-none md:basis-[46%] lg:basis-[44%]">
        {/* 상단바 (모바일 전용, Figma) */}
        <AppHeader />
        
        {/* 제목 + 탭 */}
        <div className="shrink-0 px-4 pb-0 pt-4 md:pt-5">
          <h1 className="font-bold text-ink text-[20px]">코스 목록</h1>
          <div className="mt-3">
            <CourseTabs value={routeType} onChange={changeType} />
          </div>
        </div>

        {/* 필터 + 카드 목록 (상단 고정 아래 영역 내부 스크롤) */}
        <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4 md:min-w-0">
          <CourseFilters value={filters} onChange={changeFilters} regionOptions={regionOptions} />
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
          {error ? (
            <ErrorNotice
              title={CONNECTION_ERROR_TITLE}
              description={CONNECTION_ERROR_DESC}
              onRetry={retry}
            />
          ) : loading ? (
            <p className="py-16 text-center text-[14px] text-caption">코스를 불러오는 중…</p>
          ) : (
            <>
              <CourseList
                courses={res.courses}
                routeType={routeType}
                onSelect={(course) =>
                  navigate(`/courses/${course.id}${routeType === "자전거" ? "?type=bicycle" : ""}`)
                }
              />
              <Pagination
                page={page}
                totalPages={totalPages}
                onChange={(nextPage) => updateUrlState({ routeType, filters, page: nextPage })}
              />
            </>
          )}
        </div>
      </section>

      {/* 지도: md+ 전용, 넓게 차지 */}
      <aside className="hidden md:order-2 md:block md:h-full md:min-w-0 md:flex-1">
        <KakaoMap />
      </aside>
    </div>
  );
}
