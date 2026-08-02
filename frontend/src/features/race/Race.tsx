import { useEffect, useMemo, useState } from "react";
import RaceCalendar from "./components/RaceCalendar";
import RaceList from "./components/RaceList";
import RaceDetailSheet from "./components/RaceDetailSheet";
import { fetchRaceList } from "./raceApi";
import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL, type EventType, type Race as RaceType } from "./types";
import AppHeader from "../../components/layout/AppHeader";

type ViewMode = "list" | "calendar";

export default function Race() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedRace, setSelectedRace] = useState<RaceType | null>(null);
  const [races, setRaces] = useState<RaceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<EventType | null>(null);

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
      <AppHeader />
      <div className="mx-auto w-full max-w-6xl px-4 py-4">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className={`transition-all duration-500 ${selectedRace ? "md:w-2/3" : "w-full"}`}>
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
    </>
  );
}