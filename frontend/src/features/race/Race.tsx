import { useState } from "react";
import RaceCalendar from "./components/RaceCalendar";
import RaceList from "./components/RaceList";
import RaceDetailSheet from "./components/RaceDetailSheet";
import { mockRaces as raceMock } from "./raceMock";
import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL, type Race as RaceType } from "./types";

type ViewMode = "list" | "calendar";

export default function Race() {
  const [viewMode, setViewMode] = useState<ViewMode>("list"); // 기본값은 목록
  const [selectedRace, setSelectedRace] = useState<RaceType | null>(null);

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

      {viewMode === "list" ? (
        <RaceList races={raceMock} onSelectRace={setSelectedRace} />
      ) : (
        <RaceCalendar races={raceMock} onSelectRace={setSelectedRace} />
      )}

      <RaceDetailSheet race={selectedRace} onClose={() => setSelectedRace(null)} />
    </div>
  );
}