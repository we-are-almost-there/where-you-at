import { useMemo, useState } from "react";
import type { Race } from "../types";
import { EVENT_TYPE_COLOR } from "../types";

interface RaceCalendarProps {
  races: Race[];
  onSelectRace: (race: Race) => void;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_VISIBLE_PER_DAY = 2;

function toDateKey(dateStr: string) {
  return dateStr; // "YYYY-MM-DD" 그대로 키로 사용
}

// 대회 하나가 여러 날짜(start_date~end_date)에 걸치면 그 기간의 모든 날짜에 표시
function buildDateMap(races: Race[]): Map<string, Race[]> {
  const map = new Map<string, Race[]>();
  for (const race of races) {
    const start = new Date(race.start_date);
    const end = race.end_date ? new Date(race.end_date) : start;
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(race);
      map.set(key, list);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return map;
}

export default function RaceCalendar({ races, onSelectRace }: RaceCalendarProps) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const dateMap = useMemo(() => buildDateMap(races), [races]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-indexed

  const cells = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay(); // 0=일
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const list: { date: Date | null; key: string }[] = [];
    for (let i = 0; i < startWeekday; i++) {
      list.push({ date: null, key: `blank-${i}` });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      list.push({ date, key: date.toISOString().slice(0, 10) });
    }
    return list;
  }, [year, month]);

  const todayKey = new Date().toISOString().slice(0, 10);

  const goPrevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const goNextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => setViewDate(new Date());

  return (
    <div className="w-full">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between px-1 pb-3">
        <button
          type="button"
          onClick={goPrevMonth}
          aria-label="이전 달"
          className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={goToday}
          className="text-base font-semibold text-gray-900"
        >
          {year}년 {month + 1}월
        </button>
        <button
          type="button"
          onClick={goNextMonth}
          aria-label="다음 달"
          className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
        >
          ›
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-gray-100 pb-2 text-center text-xs font-medium text-gray-400">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-y-1 pt-1">
        {cells.map(({ date, key }) => {
          if (!date) return <div key={key} />;

          const dateKey = toDateKey(key);
          const dayRaces = dateMap.get(dateKey) ?? [];
          const isToday = dateKey === todayKey;

          return (
            <div key={key} className="flex min-h-[64px] flex-col items-center gap-1 py-1">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                  isToday
                    ? "bg-[#6C5CE7] font-semibold text-white"
                    : "text-gray-700"
                }`}
              >
                {date.getDate()}
              </span>

              <div className="flex w-full flex-col items-center gap-0.5 px-0.5">
                {dayRaces.slice(0, MAX_VISIBLE_PER_DAY).map((race) => (
                  <button
                    key={race.event_id}
                    type="button"
                    onClick={() => onSelectRace(race)}
                    className="w-full truncate rounded px-1 text-[10px] leading-4 text-white"
                    style={{
                      backgroundColor: race.event_type
                        ? EVENT_TYPE_COLOR[race.event_type]
                        : "#9CA3AF",
                    }}
                    title={race.race_title}
                  >
                    {race.race_title}
                  </button>
                ))}
                {dayRaces.length > MAX_VISIBLE_PER_DAY && (
                  <span className="text-[10px] text-gray-400">
                    +{dayRaces.length - MAX_VISIBLE_PER_DAY}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}