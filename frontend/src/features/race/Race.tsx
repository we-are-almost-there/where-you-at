import { useEffect, useState } from "react";
import RaceCalendar from "./components/RaceCalendar";
import RaceList from "./components/RaceList";
import RaceDetailSheet from "./components/RaceDetailSheet";
import { fetchRaceList } from "./raceApi";
import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL, type Race as RaceType } from "./types";

type ViewMode = "list" | "calendar";

export default function Race() {
  const [viewMode, setViewMode] = useState<ViewMode>("list"); // 기본값은 목록
  const [selectedRace, setSelectedRace] = useState<RaceType | null>(null);
  const [races, setRaces] = useState<RaceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <h1 className="mb-3 text-xl font-bold text-gray-900">대회</h1>

      <div className="mb-3 flex gap-3 text-xs text-gray-500">
        {(Object.keys(EVENT_TYPE_LABEL) as (keyof typeof EVENT_TYPE_LABEL)[]).map((type) => (
          <span key={type} className="flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: EVENT_TYPE_COLOR[type] }}
            />
            {EVENT_TYPE_LABEL[type]}
          </span>
        ))}
      </div>

      {/* 세그먼트 토글 */}
      <div className="mb-4 flex rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setViewMode("list")}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
            viewMode === "list" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          목록
        </button>
        <button
          type="button"
          onClick={() => setViewMode("calendar")}
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
          <RaceList races={races} onSelectRace={setSelectedRace} />
        ) : (
          <RaceCalendar races={races} onSelectRace={setSelectedRace} />
        )
      )}

      <RaceDetailSheet race={selectedRace} onClose={() => setSelectedRace(null)} />
    </div>
  );
}