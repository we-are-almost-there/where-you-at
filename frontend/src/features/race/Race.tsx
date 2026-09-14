import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useSearchParams } from "react-router";
import RaceCalendar from "./components/RaceCalendar";
import RaceList from "./components/RaceList";
import RaceDetailSheet from "./components/RaceDetailSheet";
import { fetchAllRaces } from "./raceApi";
import { parseLocalDate } from "./dateUtils";
import { useToday } from "./useToday";
import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL, type EventType, type Race as RaceType } from "./types";
import AppHeader from "../../components/layout/AppHeader";
import Footer from "../../components/layout/Footer";
import { ErrorNotice } from "../../components/error/ErrorNotice";
import { toUserError, type UserError } from "../../components/error/userError";

type ViewMode = "list" | "calendar";

export default function Race() {
  const today = useToday();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEventId = Number(searchParams.get("eventId"));
  const linkedEventId = Number.isSafeInteger(requestedEventId) && requestedEventId > 0 ? requestedEventId : null;
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const [races, setRaces] = useState<RaceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UserError | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [activeType, setActiveType] = useState<EventType | null>(null);
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);


  const selectedRace = races.find((race) => race.event_id === linkedEventId) ?? null;
  const eventParam = searchParams.get("eventId");
  const [prevEventParam, setPrevEventParam] = useState(eventParam);
  const [pendingSelection, setPendingSelection] = useState<{
    from: string | null;
    to: string | null;
  } | null>(null);
  // 외부 링크·뒤로가기는 필터를 풀어 선택한 대회를 보여 준다.
  // 이전 값은 실제 URL이 바뀐 뒤에만 갱신한다. 라우터 전환을 기다리는 동안
  // 로컬 입력이 먼저 렌더되어도 필터 초기화가 발생하지 않는다.
  if (eventParam !== prevEventParam) {
    const isInternalSelection = pendingSelection !== null
      && pendingSelection.from === prevEventParam
      && pendingSelection.to === eventParam;
    setPrevEventParam(eventParam);
    setPendingSelection(null);
    if (!isInternalSelection) {
      setViewMode("list");
      setActiveType(null);
      setKeyword("");
      setUpcomingOnly(false);
    }
  }

  const scrollTarget = useRef<number | null>(linkedEventId);
  const selectRace = (race: RaceType | null, scroll = false) => {
    const id = race?.event_id ?? null;
    scrollTarget.current = scroll ? id : null;
    if (id === null && !searchParams.has("eventId")) return;
    const nextEventParam = id === null ? null : String(id);
    if (nextEventParam === eventParam) return;
    setPendingSelection({ from: eventParam, to: nextEventParam });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === null) next.delete("eventId");
      else next.set("eventId", String(id));
      return next;
    // 데스크톱은 상세가 인라인 패널이라 여러 대회를 가볍게 훑어보는 게 자연스러운데,
    // 그때마다 entry가 쌓이면 페이지를 나갈 때 뒤로가기를 여러 번 눌러야 한다.
    // 모바일은 바텀시트라 뒤로가기(백 제스처)로 시트를 닫는 게 자연스러운 UX이므로
    // 기존처럼 단계별 복원을 유지한다.
    }, { replace: isDesktop });
  };

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      setIsDesktop(query.matches);
      // 캘린더 뷰는 데스크톱 상세 UI가 없어서(목록 인라인 상세만 있음), 모바일
      // 바텀시트가 열린 채로 데스크톱 폭으로 넘어오면 selectedRace가 화면 어디에도
      // 표시되지 않는 "고아 상태"가 된다. 그 경우 목록으로 전환한다.
      // 이때 keyword/upcomingOnly 필터가 남아 있으면 선택한 대회가 필터링되어
      // 여전히 화면에 보이지 않는 "고아 선택" 상태가 재발하므로 함께 초기화한다.
      if (query.matches) {
        if (viewMode === "calendar") {
          setViewMode("list");
          setKeyword("");
          setUpcomingOnly(false);
        }
      }
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [viewMode]);

  // 스크롤바 유무로 본문 폭이 흔들리지 않도록 opt-in으로 처리한다.
  // (index.css의 scrollbar-gutter-stable 참고)
  useEffect(() => {
    document.documentElement.classList.add("scrollbar-gutter-stable");
    return () => {
      document.documentElement.classList.remove("scrollbar-gutter-stable");
    };
  }, []);

  // 목록은 페이지 진입 시 한 번만 가져온다. eventId 쿼리 파라미터가 바뀌어도
  // (뒤로가기, 다른 링크 진입 등) 다시 fetch하지 않고 이미 가진 races에서 선택한다.
  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;

    fetchAllRaces({ upcoming_only: false }, controller.signal)
      .then((data) => {
        if (!ignore) {
          setError(null);
          setRaces(data);
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
      controller.abort();
    };
  }, [retryTick]);

  const selectedRaceId = selectedRace?.event_id;

  useEffect(() => {
    if (isLoading || !isDesktop || viewMode !== "list" || selectedRaceId == null) return;
    if (selectedRaceId !== scrollTarget.current) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`race-trigger-${selectedRaceId}`)?.scrollIntoView({ block: "center" });
      scrollTarget.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [isLoading, isDesktop, viewMode, selectedRaceId, linkedEventId]);

  const filteredRaces = useMemo(() => {
    const search = viewMode === "list" ? keyword.trim().toLowerCase() : "";
    return races.filter((race) => {
      if (activeType && race.event_type !== activeType) return false;
      if (search && !race.race_title.toLowerCase().includes(search)) return false;
      return viewMode === "calendar" || !upcomingOnly || parseLocalDate(race.end_date ?? race.start_date).getTime() >= today;
    });
  }, [races, activeType, upcomingOnly, keyword, viewMode, today]);

  const upcomingFilter = (
    <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-ink">
      <input
        type="checkbox"
        checked={upcomingOnly}
        onChange={(event) => {
          setUpcomingOnly(event.target.checked);
          selectRace(null);
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
        <div className="flex flex-col gap-4">
          {/* 캘린더에서 선택해도 목록으로 전환해 동일한 상세 UI를 사용한다. */}
          <div className="w-full min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h1 className="font-bold text-ink text-[20px]">대회 행사 일정</h1>
              {!isLoading && !error && (
                <p className="shrink-0 text-[20px] font-bold tabular-nums text-ink" aria-live={keyword.trim() ? "off" : "polite"} aria-atomic="true">
                  {filteredRaces.length.toLocaleString("ko-KR")}개
                </p>
              )}
            </div>

            <fieldset disabled={isLoading} className="min-w-0 disabled:opacity-60">
            {/* 카테고리 필터 */}
            <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-gray-100">
              <button
                type="button"
                onClick={() => {setActiveType(null); selectRace(null);}}
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
                    onClick={() => {setActiveType(isActive ? null : type);  selectRace(null);}}
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
                  selectRace(null);
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
                  selectRace(null);
                }}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  viewMode === "calendar" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                캘린더
              </button>
            </div>

            {viewMode === "list" && <div className="mb-4 flex items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <Search aria-hidden="true" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-caption" />
                <input
                  type="search"
                  aria-label="대회명 검색"
                  placeholder="대회명 검색"
                  value={keyword}
                  onChange={(event) => {
                    setKeyword(event.target.value);
                    selectRace(null);
                  }}
                  className="h-10 w-full rounded-lg border border-divider bg-white pl-9 pr-3.5 text-sm text-ink placeholder:text-caption focus:border-accent focus:outline-none"
                />
              </div>
              {upcomingFilter}
            </div>}

            </fieldset>
            {isLoading && <p className="py-10 text-center text-sm text-gray-400">불러오는 중...</p>}
            {error && <ErrorNotice title={error.title} description={error.description} onRetry={() => {setIsLoading(true); setError(null); setRetryTick((t) => t + 1)}} />}
            {!isLoading && !error && searchParams.has("eventId") && !selectedRace && (
              <p role="status" className="mb-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-500">선택한 대회를 찾을 수 없어요. 다른 대회를 확인해 주세요. <button type="button" onClick={() => selectRace(null)} className="text-accent underline font-medium">안내 닫기</button></p>
            )}

            {!isLoading && !error && viewMode === "list" && keyword.trim() && filteredRaces.length === 0 ? (
              <p className="py-16 text-center text-sm text-gray-500" role="status">검색 조건에 맞는 대회가 없습니다.</p>
            ) : !isLoading && !error && (
              viewMode === "list" ? (
                <RaceList
                  today={today}
                  races={filteredRaces}
                  selectedRaceId={selectedRace?.event_id ?? null}
                  onSelectRace={(race) => selectRace(
                    isDesktop && selectedRace?.event_id === race.event_id ? null : race
                  )}
                  isDesktop={isDesktop}
                />
              ) : (
                <RaceCalendar
                  races={filteredRaces}
                  selectedRaceId={selectedRace?.event_id ?? null}
                  onSelectRace={(race) => {
                    if (isDesktop) {
                      setKeyword("");
                      setUpcomingOnly(false);

                      setViewMode("list");
                    }
                    selectRace(race, isDesktop);
                  }}
                />
              )
            )}
          </div>

          {selectedRace && !isDesktop && (
            <div>
              <RaceDetailSheet
                key={selectedRace.event_id}
                race={selectedRace}
                onClose={() => selectRace(null)}
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
