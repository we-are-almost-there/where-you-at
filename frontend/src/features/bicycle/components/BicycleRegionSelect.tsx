import type { RegionSelectItem } from "../../map/regionOptions";

interface Props {
  value: string;
  onChange: (value: string) => void;
  regions: RegionSelectItem[];
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
  className,
  placeholder = "전체 지역",
  disabled,
}: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
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
