import { useEffect, useMemo, useRef, useState } from "react";
import type { Race } from "../types";
import { EVENT_TYPE_BADGE_COLOR, EVENT_TYPE_LABEL, UNSPECIFIED_BADGE_COLOR } from "../types";
import { parseLocalDate } from "../dateUtils";

interface RaceCalendarProps {
  races: Race[];
  selectedRaceId?: number | null;
  /**
   * returnTarget: 모바일 상세(모달)를 닫은 뒤 초점을 받을 요소. "+N개"로 펼친 목록에서 고르면 그 목록은
   * 곧바로 닫혀 누른 버튼이 사라지므로, 남아 있는 "+N개" 버튼을 넘긴다. 없으면 누른 버튼이 대상이다.
   */
  onSelectRace: (race: Race, returnTarget?: HTMLElement | null) => void;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_NAMES = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const MAX_VISIBLE_PER_DAY = 3;
const MIN_CALENDAR_WEEKS = 5;

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildDateMap(races: Race[]): Map<string, Race[]> {
  const map = new Map<string, Race[]>();
  for (const race of races) {
    const start = parseLocalDate(race.start_date);
    const end = race.end_date ? parseLocalDate(race.end_date) : start;
    if (end < start) continue;
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
  // "+N개"로 펼친 날짜. 한 번에 하나만 펼친다.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // 날짜별 "+N개" 버튼. 펼친 목록에서 대회를 고르면 이 버튼이 초점 복귀 대상이 된다.
  const moreButtonsRef = useRef(new Map<string, HTMLButtonElement>());

  const dateMap = useMemo(() => buildDateMap(races), [races]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // 표의 한 줄 = 한 주. 달에 속하지 않는 칸은 null.
  const weeks = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const weekCount = Math.max(MIN_CALENDAR_WEEKS, Math.ceil((startWeekday + daysInMonth) / 7));
    return Array.from({ length: weekCount }, (_, week) =>
      Array.from({ length: 7 }, (_, weekday) => {
        const day = week * 7 + weekday - startWeekday + 1;
        return day >= 1 && day <= daysInMonth ? new Date(year, month, day) : null;
      }),
    );
  }, [year, month]);

  const todayKey = formatDateKey(new Date());

  const moveTo = (date: Date) => {
    setViewDate(date);
    setExpandedKey(null);
  };
  const goPrevMonth = () => moveTo(new Date(year, month - 1, 1));
  const goNextMonth = () => moveTo(new Date(year, month + 1, 1));
  const goToday = () => moveTo(new Date());

  const monthLabel = `${year}년 ${month + 1}월`;

  return (
    <div className="w-full min-w-0 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider-soft pb-3">
        <button
          type="button"
          onClick={goToday}
          title="이번 달로 이동"
          aria-label={`${monthLabel}, 이번 달로 이동`}
          className="rounded text-left text-xl font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {monthLabel}
        </button>
        {/* 이전·다음 달로 옮기면 바뀐 연월을 알린다. 버튼 이름은 그대로라 알림이 없으면 달이 바뀐 걸 모른다. */}
        <p role="status" className="sr-only">
          {monthLabel}
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={goPrevMonth}
            aria-label="이전 달"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-control-border text-sm text-gray-500 transition-colors hover:bg-control-hover focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span aria-hidden="true">&lsaquo;</span>
          </button>
          <button
            type="button"
            onClick={goNextMonth}
            aria-label="다음 달"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-control-border text-sm text-gray-500 transition-colors hover:bg-control-hover focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span aria-hidden="true">&rsaquo;</span>
          </button>
        </div>
      </div>

      {/* 요일과 날짜·대회의 관계가 보조기기에도 전달되도록 실제 표로 그린다. */}
      <div className="md:min-h-[775px]">
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">{monthLabel} 대회 일정</caption>
          <thead>
            <tr>
              {WEEKDAYS.map((w, index) => (
                <th
                  key={w}
                  scope="col"
                  abbr={WEEKDAY_NAMES[index]}
                  className="py-2.5 text-center text-[11px] font-normal text-gray-500"
                >
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, weekIndex) => (
              <tr key={weekIndex}>
                {week.map((date, weekday) => {
                  if (!date) {
                    return (
                      <td
                        key={weekday}
                        className="h-[104px] border border-divider-soft bg-surface-muted md:h-[128px]"
                      />
                    );
                  }

                  const dateKey = formatDateKey(date);
                  const dayRaces = dateMap.get(dateKey) ?? [];
                  const isToday = dateKey === todayKey;
                  const isExpanded = expandedKey === dateKey;
                  const dateLabel = `${year}년 ${month + 1}월 ${date.getDate()}일`;
                  const hiddenCount = dayRaces.length - MAX_VISIBLE_PER_DAY;

                  return (
                    <td
                      key={weekday}
                      className="relative h-[104px] border border-divider-soft bg-white p-0 align-top md:h-[128px]"
                    >
                      <div className="flex min-w-0 flex-col gap-1 px-1 py-1 sm:px-2 md:py-2">
                        <span
                          aria-current={isToday ? "date" : undefined}
                          className={`flex h-[22px] w-6 shrink-0 items-center justify-center rounded-md text-[11px] ${
                            isToday ? "font-semibold text-white" : "text-gray-500"
                          }`}
                          style={isToday ? { backgroundColor: "var(--color-accent)" } : undefined}
                        >
                          {date.getDate()}
                        </span>

                        <div className="flex w-full min-w-0 flex-col gap-[3px]">
                          {dayRaces.slice(0, MAX_VISIBLE_PER_DAY).map((race) => (
                            <CalendarRaceButton
                              key={race.event_id}
                              race={race}
                              dateLabel={dateLabel}
                              selectedRaceId={selectedRaceId}
                              onSelect={onSelectRace}
                            />
                          ))}
                          {hiddenCount > 0 && (
                            <button
                              ref={(el) => {
                                if (el) moreButtonsRef.current.set(dateKey, el);
                                else moreButtonsRef.current.delete(dateKey);
                              }}
                              type="button"
                              aria-expanded={isExpanded}
                              aria-label={`${dateLabel} 대회 ${hiddenCount}개 더 보기`}
                              onClick={() => setExpandedKey(isExpanded ? null : dateKey)}
                              className="min-h-6 shrink-0 cursor-pointer self-start rounded-sm px-1 text-left text-[10px] font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent sm:text-[11px]"
                            >
                              +{hiddenCount}개
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <DayRacesPopover
                          dateLabel={dateLabel}
                          races={dayRaces}
                          selectedRaceId={selectedRaceId}
                          onSelect={(race) => {
                            setExpandedKey(null);
                            onSelectRace(race, moreButtonsRef.current.get(dateKey));
                          }}
                          onClose={() => setExpandedKey(null)}
                          alignEnd={weekday >= 4}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function badgeColor(race: Race) {
  return race.event_type ? EVENT_TYPE_BADGE_COLOR[race.event_type] : UNSPECIFIED_BADGE_COLOR;
}

/**
 * 칸 안의 대회 버튼. 이름에 날짜를 넣어, Tab으로만 옮겨 다녀도 언제 대회인지 알 수 있게 한다.
 * 선택 상태는 테두리로만 표시한다 — 나머지를 흐리게(opacity) 하면 흰 글자 대비가 무너진다.
 */
function CalendarRaceButton({
  race,
  dateLabel,
  selectedRaceId,
  onSelect,
  wide = false,
}: {
  race: Race;
  dateLabel: string;
  selectedRaceId?: number | null;
  onSelect: (race: Race) => void;
  wide?: boolean;
}) {
  const isSelected = race.event_id === selectedRaceId;
  const typeLabel = race.event_type ? EVENT_TYPE_LABEL[race.event_type] : "종목 미정";
  return (
    <button
      type="button"
      data-race-id={race.event_id}
      onClick={() => onSelect(race)}
      aria-pressed={isSelected}
      aria-label={`${dateLabel}, ${race.race_title} (${typeLabel})`}
      className={`min-h-6 w-full min-w-0 shrink-0 truncate rounded-sm px-1.5 text-left font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
        wide ? "py-1 text-[13px]" : "text-[10px] leading-4 sm:text-[11px] md:leading-5"
      } ${isSelected ? "ring-2 ring-ink ring-offset-1" : ""}`}
      style={{ backgroundColor: badgeColor(race) }}
      title={race.race_title}
    >
      {race.race_title}
    </button>
  );
}

/** "+N개"로 여는 그날의 전체 대회 목록. Escape·바깥 클릭·초점 이탈로 닫고, 닫으면 "+N개" 버튼으로 초점이 돌아간다. */
function DayRacesPopover({
  dateLabel,
  races,
  selectedRaceId,
  onSelect,
  onClose,
  alignEnd,
}: {
  dateLabel: string;
  races: Race[];
  selectedRaceId?: number | null;
  onSelect: (race: Race) => void;
  onClose: () => void;
  alignEnd: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const root = rootRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root?.querySelector<HTMLElement>("button")?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };
    // 여는 버튼을 다시 누르는 건 그 버튼의 onClick이 닫는다. 여기서도 닫으면 닫혔다 곧바로 다시 열린다.
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (root && !root.contains(target) && !opener?.contains(target)) onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      const active = document.activeElement;
      const focusStillHere = !active || active === document.body || Boolean(root?.contains(active));
      if (focusStillHere && opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`${dateLabel} 대회 전체`}
      className={`absolute top-1 z-20 flex w-56 max-w-[80vw] flex-col gap-1.5 rounded-lg border border-divider bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${
        alignEnd ? "right-1" : "left-1"
      }`}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) onClose();
      }}
    >
      <p className="px-0.5 text-[12px] font-bold text-ink">{dateLabel}</p>
      {races.map((race) => (
        <CalendarRaceButton
          key={race.event_id}
          race={race}
          dateLabel={dateLabel}
          selectedRaceId={selectedRaceId}
          onSelect={onSelect}
          wide
        />
      ))}
    </div>
  );
}
