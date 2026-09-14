import { useMemo } from "react";
import type { Race } from "../types";
import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL } from "../types";
import { parseLocalDate } from "../dateUtils";
import RaceDetailSheet from "./RaceDetailSheet";

interface RaceListProps {
  today: number;
  races: Race[];
  selectedRaceId?: number | null;
  onSelectRace: (race: Race) => void;
  isDesktop: boolean;
}

export default function RaceList({ races, selectedRaceId, onSelectRace, isDesktop, today }: RaceListProps) {
  const sorted = useMemo(
    () => [...races].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()),
    [races]
  );

  const { monthGroups, showYear } = useMemo(() => {
    const groups = new Map<string, { year: number; month: number; races: Race[] }>();
    for (const race of sorted) {
      const date = parseLocalDate(race.start_date);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${month}`;
      const group = groups.get(key) ?? { year, month, races: [] };
      group.races.push(race);
      groups.set(key, group);
    }
    const yearSet = new Set([...groups.values()].map((g) => g.year));
    return { monthGroups: groups, showYear: yearSet.size > 1 };
  }, [sorted]);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-gray-400">등록된 대회가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {[...monthGroups.entries()].map(([key, group]) => (
        <section key={key} aria-labelledby={`race-month-${key}`}>
          <div className="mb-3 flex items-center gap-2 px-1">
            <h2 id={`race-month-${key}`} className="shrink-0 text-base font-bold text-ink">
              {showYear || group.year !== new Date(today).getFullYear() ? `${group.year}년 ` : ""}{group.month}월
            </h2>
            <span className="shrink-0 text-[11px] text-gray-500">{group.races.length}개 대회</span>
            <span aria-hidden="true" className="ml-1 flex-1 border-t-2 border-dashed border-divider" />
          </div>
          <div className="flex flex-col gap-2">
        {group.races.map((race) => {
          const isSelected = race.event_id === selectedRaceId;
          const start = parseLocalDate(race.start_date);
          const end = race.end_date ? parseLocalDate(race.end_date) : start;
          const duration = Math.round((
            Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
            Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
          ) / 86_400_000) + 1;
          const isEnded = end.getTime() < today;
          const color = race.event_type ? EVENT_TYPE_COLOR[race.event_type] : "#9CA3AF";
          const textColor = race.event_type === "cycling" ? "var(--color-race-cycling-text)" : color;
          const location = race.location_name?.replace(/\s*·\s*/g, " | ");

          return (
            <div
              key={race.event_id}
              className={`overflow-hidden rounded-2xl border bg-white transition-colors duration-200 ${
                isSelected ? "relative z-10 border-accent" : "border-[#ebe8f7]"
              }`}
            >
              <button
                id={`race-trigger-${race.event_id}`}
                type="button"
                onClick={() => onSelectRace(race)}
                aria-expanded={isDesktop ? isSelected : undefined}
                aria-controls={isDesktop && isSelected ? `race-detail-${race.event_id}` : undefined}
                className={`flex w-full items-start gap-4 px-4 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                  isSelected ? "bg-[#F7F6FF]" : "hover:bg-[#faf9fd]"
                }`}
              >
                <span
                  className={`flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-xl ${isEnded ? "bg-gray-100 text-gray-500" : ""}`}
                  style={isEnded ? undefined : {
                    backgroundColor: `color-mix(in srgb, ${color} 7%, transparent)`,
                    color: textColor,
                  }}
                >
                  <span className="text-xl font-bold leading-6 tabular-nums">
                    {start.getDate()}
                  </span>
                  <span className="text-[11px] font-medium leading-4">
                    {"일월화수목금토"[start.getDay()]}
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="mb-1 flex flex-wrap items-center gap-1.5">
                    {race.event_type && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${isEnded ? "bg-gray-100 text-gray-400" : ""}`}
                        style={isEnded ? undefined : { backgroundColor: `color-mix(in srgb, ${color} 9%, transparent)`, color: textColor }}
                      >
                        {EVENT_TYPE_LABEL[race.event_type]}
                      </span>
                    )}
                    {isEnded && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">종료</span>
                    )}
                    {duration > 1 && (
                      <span className={`rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium ${isEnded ? "text-gray-400" : "text-ink"}`}>
                        ~ {end.getMonth() + 1}.{String(end.getDate()).padStart(2, "0")} ({duration}일간)
                      </span>
                    )}
                  </span>
                  <span className={`block truncate text-[15px] font-bold leading-6 ${isEnded ? "text-gray-400" : "text-ink"}`}>
                    {race.race_title}
                  </span>
                  {location && (
                    <span className="mt-0.5 block truncate text-xs text-gray-500">{location}</span>
                  )}
                </span>

                <span
                  aria-hidden="true"
                  className={`shrink-0 px-1 pt-0.5 ${isDesktop ? "text-3xl" : "text-lg"} ${isSelected ? "" : "text-[#c5bfde]"}`}
                  style={isSelected ? { color: EVENT_TYPE_COLOR.running } : undefined}
                >
                  {isDesktop ? (isSelected ? "▴" : "▾") : "›"}
                </span>
              </button>
              {isDesktop && isSelected && (
                <div id={`race-detail-${race.event_id}`} role="region" aria-labelledby={`race-trigger-${race.event_id}`}>
                  <RaceDetailSheet race={race} onClose={() => onSelectRace(race)} inline />
                </div>
              )}
            </div>
          );
        })}
          </div>
        </section>
      ))}
    </div>
  );
}
