import type { Race } from "../types";
import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL } from "../types";

interface RaceListProps {
  races: Race[];
  onSelectRace: (race: Race) => void;
}

function formatDateRange(start: string, end: string | null) {
  const fmt = (s: string) => {
    const d = new Date(s);
    return `${d.getMonth() + 1}.${d.getDate()}(${"일월화수목금토"[d.getDay()]})`;
  };
  if (!end || end === start) return fmt(start);
  return `${fmt(start)} ~ ${fmt(end)}`;
}

export default function RaceList({ races, onSelectRace }: RaceListProps) {
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
      {sorted.map((race) => (
        <button
          key={race.event_id}
          type="button"
          onClick={() => onSelectRace(race)}
          className="flex items-center gap-3 py-3 text-left"
        >
          <span
            className="h-full min-h-[44px] w-1 shrink-0 rounded-full"
            style={{
              backgroundColor: race.event_type
                ? EVENT_TYPE_COLOR[race.event_type]
                : "#9CA3AF",
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
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
            </div>
            <p className="truncate text-sm font-medium text-gray-900">
              {race.race_title}
            </p>
            {race.location_name && (
              <p className="truncate text-xs text-gray-500">{race.location_name}</p>
            )}
          </div>
          <span className="shrink-0 text-gray-300">›</span>
        </button>
      ))}
    </div>
  );
}