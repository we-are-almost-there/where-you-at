import { CATEGORY_META, CATEGORY_ORDER, type SpotCategory } from "../types";

interface Props {
  value: SpotCategory;
  onChange: (v: SpotCategory) => void;
}

export function CategoryFilter({ value, onChange }: Props) {
  return (
    <div className="grid w-full grid-cols-4 gap-2">
      {CATEGORY_ORDER.map((c) => {
        const active = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-pressed={active}
            className={`rounded-full py-2.5 text-center text-[13px] font-medium transition-colors ${
              active ? "bg-accent text-white" : "border border-divider bg-white text-ink"
            }`}
          >
            {CATEGORY_META[c].label}
          </button>
        );
      })}
    </div>
  );
}
