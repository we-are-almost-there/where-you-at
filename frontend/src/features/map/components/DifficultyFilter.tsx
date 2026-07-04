import { DIFFICULTY_OPTIONS } from "../coursesMock";

interface Props {
  value: string; // "" = 선택 안 함(전체)
  onChange: (value: string) => void;
}

// 쉬움·보통·어려움 토글. 활성 버튼을 다시 누르면 해제(전체)되어 별도 '전체' 버튼이 필요 없다.
export function DifficultyFilter({ value, onChange }: Props) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 text-[13px]">
      <span className="text-caption">난이도</span>
      <span className="h-3.5 w-px shrink-0 bg-divider" aria-hidden="true" />
      {DIFFICULTY_OPTIONS.filter((o) => o.value).map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(active ? "" : o.value)}
            aria-pressed={active}
            className={`cursor-pointer transition-colors ${
              active ? "font-bold text-accent" : "text-caption hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
