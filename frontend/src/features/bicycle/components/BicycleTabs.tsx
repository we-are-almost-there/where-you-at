export type DataSourceTab = "운영 정보" | "실시간";

const TABS: DataSourceTab[] = ["운영 정보", "실시간"];
interface Props {
  value: DataSourceTab;
  onChange: (value: DataSourceTab) => void;
}

export function BicycleTabs({ value, onChange }: Props) {
  return (
    <div className="flex gap-6" role="tablist">
      {TABS.map((tab) => {
        const active = tab === value;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab)}
            className="relative cursor-pointer pb-2 text-[15px] font-bold"
          >
            <span className={active ? "text-accent" : "text-caption"}>{tab}</span>
            {active && <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}
