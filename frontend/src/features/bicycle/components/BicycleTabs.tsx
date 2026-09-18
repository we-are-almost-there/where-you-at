import { Tabs } from "../../../components/common/Tabs";
import { BICYCLE_TAB_ID_BASE as ID_BASE, BICYCLE_TABS as TABS, type DataSourceTab } from "./bicycleTabItems";

export type { DataSourceTab };

interface Props {
  value: DataSourceTab;
  onChange: (value: DataSourceTab) => void;
}

export function BicycleTabs({ value, onChange }: Props) {
  return (
    <Tabs
      idBase={ID_BASE}
      label="자전거 대여소 정보 종류"
      items={TABS}
      value={value}
      onChange={onChange}
      className="flex gap-6"
      tabClassName={() => "relative cursor-pointer pb-2 text-[15px] font-bold"}
      renderLabel={(tab, active) => (
        <>
          <span className={active ? "text-accent" : "text-muted"}>{tab.label}</span>
          {active && <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-accent" />}
        </>
      )}
    />
  );
}
