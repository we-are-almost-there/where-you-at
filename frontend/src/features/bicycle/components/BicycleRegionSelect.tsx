import type { RegionSelectItem } from "../../map/regionOptions";

interface Props {
  value: string;
  onChange: (value: string) => void;
  regions: RegionSelectItem[];
  /** 보이는 레이블이 없어서 화면낭독기용 이름을 받는다. 첫 옵션(placeholder)은 값이 바뀌면 사라져 이름이 될 수 없다. */
  label: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

function isGroup(item: RegionSelectItem): item is Extract<RegionSelectItem, { options: unknown }> {
  return "options" in item;
}

export function BicycleRegionSelect({
  value,
  onChange,
  regions,
  label,
  className,
  placeholder = "전체 지역",
  disabled,
}: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={className}
      disabled={disabled}
    >
      <option value="">{placeholder}</option>
      {regions.map((item) =>
        isGroup(item) ? (
          <optgroup key={item.label} label={item.label}>
            {item.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ),
      )}
    </select>
  );
}
