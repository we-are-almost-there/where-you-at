import { useMemo, useState } from "react";
import type { Race } from "../types";
import { EVENT_TYPE_COLOR } from "../types";
import { parseLocalDate } from "../dateUtils";

interface RaceCalendarProps {
  races: Race[];
  selectedRaceId?: number | null;
  onSelectRace: (race: Race) => void;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_VISIBLE_PER_DAY = 3;
const MIN_CALENDAR_WEEKS = 5;

// Date 객체를 로컬 타임존 기준 "YYYY-MM-DD"로 포맷.
// toISOString()은 UTC 기준이라 KST(UTC+9)에서 하루가 밀리는 문제가 있어 사용하지 않는다.
function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 대회 하나가 여러 날짜(start_date~end_date)에 걸치면 그 기간의 모든 날짜에 표시
function buildDateMap(races: Race[]): Map<string, Race[]> {
  const map = new Map<string, Race[]>();
  for (const race of races) {
    const start = parseLocalDate(race.start_date);
    const end = race.end_date ? parseLocalDate(race.end_date) : start;
    if (end < start) continue; // 잘못된 데이터는 건너뛴다 (목록 뷰는 그대로 노출)
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = formatDateKey(cursor);
      const list = map.get(key) ?? [];
      list.push(race);
      map.set(key, list);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return map;
}

export default function RaceCalendar({ races, selectedRaceId, onSelectRace }: RaceCalendarProps) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const dateMap = useMemo(() => buildDateMap(races), [races]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-indexed

  const cells = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay(); // 0=일
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const weekCount = Math.max(MIN_CALENDAR_WEEKS, Math.ceil((startWeekday + daysInMonth) / 7));
    return Array.from({ length: weekCount * 7 }, (_, index) => {
      const day = index - startWeekday + 1;
      return {
        key: `cell-${index}`,
        date: day >= 1 && day <= daysInMonth ? new Date(year, month, day) : null,
      };
    });
  }, [year, month]);

  const todayKey = formatDateKey(new Date());

  const goPrevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const goNextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => setViewDate(new Date());

  return (
    <div className="w-full min-w-0 bg-white">
      {/* 월 네비게이션 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ebe8f7] pb-3">
        <button
          type="button"
          onClick={goToday}
          title="이번 달로 이동"
          aria-label={`${year}년 ${month + 1}월, 이번 달로 이동`}
          className="rounded text-left text-xl font-bold text-[#29235c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C5CE7]"
        >
          {year}년 {month + 1}월
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={goPrevMonth}
            aria-label="이전 달"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e2ddf5] text-sm text-gray-500 transition-colors hover:bg-[#f6f4fc] focus-visible:outline-2 focus-visible:outline-[#6C5CE7]"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goNextMonth}
            aria-label="다음 달"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e2ddf5] text-sm text-gray-500 transition-colors hover:bg-[#f6f4fc] focus-visible:outline-2 focus-visible:outline-[#6C5CE7]"
          >
            ›
          </button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 py-2.5 text-center text-[11px] text-gray-500">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      {/* 데스크톱은 6주 높이를 확보하고, 모바일은 실제 주 수만큼만 표시한다. */}
      <div className="md:min-h-[775px]">
        <div className="grid auto-rows-[104px] grid-cols-7 gap-px border border-[#ebe8f7] bg-[#ebe8f7] md:auto-rows-[128px]">
          {cells.map(({ date, key }) => {
            if (!date) return <div key={key} aria-hidden="true" className="bg-[#f9f8fc]" />;

            const dateKey = formatDateKey(date);
            const dayRaces = dateMap.get(dateKey) ?? [];
            const isToday = dateKey === todayKey;

            return (
              <div key={key} aria-label={`${year}년 ${month + 1}월 ${date.getDate()}일`} className="flex min-h-0 min-w-0 flex-col gap-1 bg-white px-1 py-1 sm:px-2 md:py-2">
                <span
                  aria-current={isToday ? "date" : undefined}
                  className={`flex h-[22px] w-6 shrink-0 items-center justify-center rounded-md text-[11px] ${
                    isToday ? "font-semibold text-white" : "text-gray-500"
                  }`}
                  style={isToday ? { backgroundColor: EVENT_TYPE_COLOR.running } : undefined}
                >
                  {date.getDate()}
                </span>

                <div className="flex w-full min-h-0 min-w-0 flex-col gap-[3px]">
                  {dayRaces.slice(0, MAX_VISIBLE_PER_DAY).map((race) => {
                    const isSelected = race.event_id === selectedRaceId;
                    return (
                      <button
                        key={race.event_id}
                        type="button"
                        onClick={() => onSelectRace(race)}
                        aria-pressed={isSelected}
                        className={`w-full min-w-0 shrink-0 truncate rounded-sm px-1.5 text-left text-[10px] font-medium leading-4 text-white transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#29235c] sm:text-[11px] md:leading-5 ${
                          selectedRaceId != null && !isSelected ? "opacity-40" : "opacity-100"
                        }`}
                        style={{
                          backgroundColor: race.event_type
                            ? EVENT_TYPE_COLOR[race.event_type]
                            : "#9CA3AF",
                        }}
                        title={race.race_title}
                      >
                        {race.race_title}
                      </button>
                    );
                  })}
                  {dayRaces.length > MAX_VISIBLE_PER_DAY && (
                    <span className="shrink-0 text-[10px] font-medium leading-3 text-gray-400 md:leading-4">
                      +{dayRaces.length - MAX_VISIBLE_PER_DAY}개
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
