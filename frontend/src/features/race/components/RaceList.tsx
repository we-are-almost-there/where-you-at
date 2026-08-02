import type { Race } from "../types";
import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL } from "../types";
import { formatDateRange } from "../dateUtils";

interface RaceListProps {
  races: Race[];
  selectedRaceId?: number | null;
  onSelectRace: (race: Race) => void;
}

export default function RaceList({ races, selectedRaceId, onSelectRace }: RaceListProps) {
  const sorted = [...races].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-gray-400">등록된 대회가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-gray-100">
      {sorted.map((race) => {
        const isSelected = race.event_id === selectedRaceId;
        return (
          <button
            key={race.event_id}
            type="button"
            onClick={() => onSelectRace(race)}
            className={`flex items-center gap-3 py-3 text-left transition-colors ${
              isSelected ? "bg-[#F7F6FF]" : ""
            }`}
          >
            <span
              className="h-full min-h-[44px] w-1 shrink-0 rounded-full"
              style={{ backgroundColor: race.event_type ? EVENT_TYPE_COLOR[race.event_type] : "#9CA3AF" }}
            />
            <span className="min-w-0 flex-1">
              <span className="mb-1 flex items-center gap-2">
                {race.event_type && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                    style={{ backgroundColor: EVENT_TYPE_COLOR[race.event_type] }}
                  >
                    {EVENT_TYPE_LABEL[race.event_type]}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {formatDateRange(race.start_date, race.end_date)}
                </span>
              </span>
              <span
                className={`block truncate text-sm ${
                  isSelected ? "font-semibold text-[#6C5CE7]" : "font-medium text-gray-900"
                }`}
              >
                {race.race_title}
              </span>
              {race.location_name && (
                <span className="block truncate text-xs text-gray-500">{race.location_name}</span>
              )}
            </span>
            <span className={`shrink-0 ${isSelected ? "text-[#6C5CE7]" : "text-gray-300"}`}>›</span>
          </button>
        );
      })}
    </div>
  );
}