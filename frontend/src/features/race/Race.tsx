import { useEffect, useMemo, useState } from "react";
import RaceCalendar from "./components/RaceCalendar";
import RaceList from "./components/RaceList";
import RaceDetailSheet from "./components/RaceDetailSheet";
import { fetchRaceList } from "./raceApi";
import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL, type EventType, type Race as RaceType } from "./types";
import AppHeader from "../../components/layout/AppHeader";
import Footer from "../../components/layout/Footer";

type ViewMode = "list" | "calendar";

export default function Race() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedRace, setSelectedRace] = useState<RaceType | null>(null);
  const [races, setRaces] = useState<RaceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<EventType | null>(null);

  // 헤더 정렬이 어긋나지 않도록 이 페이지에서만 scrollbar-gutter: stable을 켠다.
  useEffect(() => {
    document.documentElement.classList.add("scrollbar-gutter-stable");
    return () => document.documentElement.classList.remove("scrollbar-gutter-stable");
  }, []);

  useEffect(() => {
    let ignore = false;

    fetchRaceList({ upcoming_only: false })
      .then((data) => {
        if (!ignore) setRaces(data);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : "대회 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const filteredRaces = useMemo(() => {
    if (!activeType) return races;
    return races.filter((r) => r.event_type === activeType);
  }, [races, activeType]);

  return (
    <>
      <AppHeader variant="wide" />
      {/* 콘텐츠가 화면 전체 폭을 그대로 쓰면 넓은 화면에서 왼쪽에만 쏠려 보여 max-w로 가운데 정렬한다.
        폭은 max-w-6xl(72rem)로 — AppHeader.tsx(wide variant)의 좌우 padding 계산식과
        Home.tsx의 BannerCarousel(banners.tsx)이 쓰는 max-w-6xl 기준을 그대로 따른 것.
        기준이 다르면 페이지를 옮길 때마다 헤더·본문 좌우 끝이 미묘하게 어긋나 보인다
        (콘텐츠 길이에 따른 스크롤 유무 오차는 위 useEffect의 scrollbar-gutter-stable로 처리). */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-4">
        {/* selectedRace가 없으면(좌측 블록만 있을 때) md:justify-center로 그 블록을
          컨테이너 가운데로. 상세가 열리면 좌+우 두 블록이 나란히 있어야 하니 기본 정렬로 되돌림. */}
        <div className={`flex flex-col gap-4 md:flex-row ${!selectedRace ? "md:justify-center" : ""}`}>
          {/* 662px 임의값 대신 Tailwind 표준 스케일(max-w-2xl, 672px)로 교체.
            실측 결과 이 폭에서 카드 콘텐츠가 여유 있게 들어가 특별히 방어해야 할
            최소값은 없었고, 표준 스케일을 쓰는 게 근거 없는 매직넘버보다 낫다고 판단. */}
          <div className={`w-full max-w-2xl transition-all duration-500 ${selectedRace ? "md:w-2/3" : ""}`}>
            <h1 className="mb-3 text-xl font-bold text-gray-900">대회</h1>

            {/* 카테고리 필터 */}
            <div className="mb-4 flex gap-5 border-b border-gray-100">
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

            {isLoading && <p className="py-10 text-center text-sm text-gray-400">불러오는 중...</p>}
            {error && <p className="py-10 text-center text-sm text-red-500">{error}</p>}

            {!isLoading && !error && (
              viewMode === "list" ? (
                <RaceList
                  races={filteredRaces}
                  selectedRaceId={selectedRace?.event_id ?? null}
                  onSelectRace={setSelectedRace}
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

          {selectedRace && (
            <div className="md:w-1/3">
              <RaceDetailSheet
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
