import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useSearchParams } from "react-router";
import RaceCalendar from "./components/RaceCalendar";
import RaceList from "./components/RaceList";
import RaceDetailSheet from "./components/RaceDetailSheet";
import { fetchRaceList } from "./raceApi";
import { parseLocalDate } from "./dateUtils";
import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL, type EventType, type Race as RaceType } from "./types";
import AppHeader from "../../components/layout/AppHeader";
import Footer from "../../components/layout/Footer";
import { ErrorNotice } from "../../components/error/ErrorNotice";
import { toUserError, type UserError } from "../../components/error/userError";

type ViewMode = "list" | "calendar";

export default function Race() {
  const [searchParams] = useSearchParams();
  const requestedEventId = Number(searchParams.get("eventId"));
  const linkedEventId = Number.isSafeInteger(requestedEventId) && requestedEventId > 0 ? requestedEventId : null;
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedRace, setSelectedRace] = useState<RaceType | null>(null);
  const [races, setRaces] = useState<RaceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UserError | null>(null);
  const [activeType, setActiveType] = useState<EventType | null>(null);
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsDesktop(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // 스크롤바 유무로 본문 폭이 흔들리지 않도록 opt-in으로 처리한다.
  // (index.css의 scrollbar-gutter-stable 참고)
  useEffect(() => {
    document.documentElement.classList.add("scrollbar-gutter-stable");
    return () => {
      document.documentElement.classList.remove("scrollbar-gutter-stable");
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    fetchRaceList({ upcoming_only: false })
      .then((data) => {
        if (!ignore) {
          setError(null);
          setRaces(data);
          setSelectedRace(data.find((race) => race.event_id === linkedEventId) ?? null);
          setViewMode("list");
          setActiveType(null);
          setKeyword("");
          setUpcomingOnly(false);
        }
      })
      .catch((err) => {
        if (!ignore) setError(toUserError(err, "대회 목록을 불러오지 못했어요"));
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [linkedEventId]);

  useEffect(() => {
    if (isLoading || !isDesktop || viewMode !== "list" || selectedRace?.event_id !== linkedEventId) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`race-trigger-${linkedEventId}`)?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [isLoading, isDesktop, viewMode, selectedRace, linkedEventId]);

  const filteredRaces = useMemo(() => {
    const search = viewMode === "list" ? keyword.trim().toLowerCase() : "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return races.filter((race) => {
      if (activeType && race.event_type !== activeType) return false;
      if (search && !race.race_title.toLowerCase().includes(search)) return false;
      // 종료일이 오늘인 대회와 여러 날에 걸쳐 진행 중인 대회도 포함한다.
      return viewMode === "calendar" || !upcomingOnly || parseLocalDate(race.end_date ?? race.start_date) >= today;
    });
  }, [races, activeType, upcomingOnly, keyword, viewMode]);

  const upcomingFilter = (
    <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-ink">
      <input
        type="checkbox"
        checked={upcomingOnly}
        onChange={(event) => {
          setUpcomingOnly(event.target.checked);
          setSelectedRace(null);
        }}
        className="h-4 w-4 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      예정된 대회만
    </label>
  );

  return (
    <>
      <AppHeader />
      {/* 콘텐츠가 화면 전체 폭을 그대로 쓰면 넓은 화면에서 왼쪽에만 쏠려 보여 max-w로 가운데 정렬한다.
        폭은 max-w-6xl(72rem)로 — AppHeader.tsx의 좌우 padding 계산식과
        Home.tsx의 BannerCarousel(banners.tsx)이 쓰는 max-w-6xl 기준을 그대로 따른 것.
        기준이 다르면 페이지를 옮길 때마다 헤더·본문 좌우 끝이 미묘하게 어긋나 보인다. */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-4">
        {/* selectedRace가 없으면(좌측 블록만 있을 때) md:justify-center로 그 블록을
          컨테이너 가운데로. 상세가 열리면 좌+우 두 블록이 나란히 있어야 하니 기본 정렬로 되돌림. */}
        <div className={`flex flex-col gap-4 md:flex-row ${!selectedRace ? "md:justify-center" : ""}`}>
          {/* 목록 상세는 항목 아래에 펼치고, 달력 상세는 옆 패널로 표시한다. */}
          <div className={`w-full min-w-0 transition-all duration-500 ${selectedRace && viewMode === "calendar" ? "md:w-2/3" : ""}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h1 className="font-bold text-ink text-[20px]">대회·행사 일정</h1>
              {!isLoading && !error && (
                <p className="shrink-0 text-[20px] font-bold tabular-nums text-ink" aria-live="polite" aria-atomic="true">
                  {filteredRaces.length.toLocaleString("ko-KR")}개
                </p>
              )}
            </div>

            {/* 카테고리 필터 */}
            <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-gray-100">
              <button
                type="button"
                onClick={() => {setActiveType(null); setSelectedRace(null);}}
                className={`relative pb-2 text-sm font-medium transition-colors ${
                  activeType === null ? "text-gray-900" : "text-gray-400"
                }`}
              >
                전체
                {activeType === null && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-gray-900" />
                )}
              </button>
              {(Object.keys(EVENT_TYPE_LABEL) as EventType[]).map((type) => {
                const isActive = activeType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {setActiveType(isActive ? null : type);  setSelectedRace(null);}}
                    className={`relative pb-2 text-sm font-medium transition-colors ${
                      isActive ? "text-gray-900" : "text-gray-400"
                    }`}
                  >
                    {EVENT_TYPE_LABEL[type]}
                    {isActive && (
                      <span
                        className="absolute inset-x-0 -bottom-px h-0.5 rounded-full"
                        style={{ backgroundColor: EVENT_TYPE_COLOR[type] }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* 세그먼트 토글 */}
            <div className="mb-4 flex rounded-lg bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setViewMode("list");
                  setSelectedRace(null);
                }}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  viewMode === "list" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                목록
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode("calendar");
                  setSelectedRace(null);
                }}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  viewMode === "calendar" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                캘린더
              </button>
            </div>

            {viewMode === "list" && <div className="mb-4 flex items-center gap-3">
              {viewMode === "list" && <div className="relative min-w-0 flex-1">
                <Search aria-hidden="true" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
                <input
                  type="search"
                  aria-label="대회명 검색"
                  placeholder="대회명 검색"
                  value={keyword}
                  onChange={(event) => {
                    setKeyword(event.target.value);
                    setSelectedRace(null);
                  }}
                  className="h-10 w-full rounded-lg border border-divider bg-white pl-9 pr-3.5 text-sm text-ink placeholder:text-caption focus:border-accent focus:outline-none"
                />
              </div>}
              {upcomingFilter}
            </div>}

            {isLoading && <p className="py-10 text-center text-sm text-gray-400">불러오는 중...</p>}
            {error && <ErrorNotice title={error.title} description={error.description} />}
            {!isLoading && !error && linkedEventId && !races.some((race) => race.event_id === linkedEventId) && (
              <p role="status" className="mb-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-500">선택한 대회를 찾을 수 없어요. 다른 대회를 확인해 주세요.</p>
            )}

            {!isLoading && !error && viewMode === "list" && keyword.trim() && filteredRaces.length === 0 ? (
              <p className="py-16 text-center text-sm text-gray-500" role="status">검색 조건에 맞는 대회가 없습니다.</p>
            ) : !isLoading && !error && (
              viewMode === "list" ? (
                <RaceList
                  races={filteredRaces}
                  selectedRaceId={selectedRace?.event_id ?? null}
                  onSelectRace={(race) => setSelectedRace((current) =>
                    isDesktop && current?.event_id === race.event_id ? null : race
                  )}
                  isDesktop={isDesktop}
                />
              ) : (
                <RaceCalendar
                  races={filteredRaces}
                  selectedRaceId={selectedRace?.event_id ?? null}
                  onSelectRace={setSelectedRace}
                />
              )
            )}
          </div>

          {selectedRace && (!isDesktop || viewMode === "calendar") && (
            <div className="md:w-1/3">
              <RaceDetailSheet
                key={selectedRace.event_id}
                race={selectedRace}
                onClose={() => setSelectedRace(null)}
                backLabel={viewMode === "calendar" ? "캘린더로" : "목록으로"}
              />
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
