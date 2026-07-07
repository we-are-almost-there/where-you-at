import type { ReactNode } from "react";
import type { CourseFilterState } from "../types";
import { DISTANCE_OPTIONS, REGION_OPTIONS, SORT_OPTIONS } from "../coursesMock";

interface Props {
  value: CourseFilterState;
  onChange: (next: CourseFilterState) => void;
}

// 네이티브 화살표 대신 커스텀 셰브론을 써서 화살표 오른쪽 여백(right-3)을
// 텍스트 왼쪽 여백(pl-3)과 동일하게 맞춘다.
function FilterSelect({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={`relative min-w-0 ${disabled ? "opacity-50" : ""}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none truncate rounded-lg border border-divider bg-white py-2 pl-2.5 pr-7 text-[13px] text-ink focus:border-accent focus:outline-none disabled:cursor-not-allowed"
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-caption"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function CourseFilters({ value, onChange }: Props) {
  const set = <K extends keyof CourseFilterState>(key: K, v: CourseFilterState[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-2.5">
      <input
        type="search"
        value={value.keyword}
        onChange={(e) => set("keyword", e.target.value)}
        placeholder="코스 이름 검색"
        className="w-full rounded-lg border border-divider bg-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-caption focus:border-accent focus:outline-none"
      />
      {/* 지역 · 거리 · 정렬: 한 줄 3열 고정 */}
      <div className="grid grid-cols-3 gap-2">
        <FilterSelect value={value.region} onChange={(v) => set("region", v)}>
          {REGION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </FilterSelect>
        <FilterSelect value={value.distance} onChange={(v) => set("distance", v)}>
          {DISTANCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </FilterSelect>
        <FilterSelect value={value.sort} onChange={(v) => set("sort", v)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </FilterSelect>
      </div>
    </div>
  );
}
