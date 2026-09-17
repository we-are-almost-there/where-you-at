import type { RouteType } from "../types";
import { COURSE_TAB_ID_BASE as ID_BASE, COURSE_TABS as TABS } from "./courseTabItems";
import { Tabs } from "../../../components/common/Tabs";

interface Props {
  value: RouteType;
  onChange: (value: RouteType) => void;
}

export function CourseTabs({ value, onChange }: Props) {
  return (
    <Tabs
      idBase={ID_BASE}
      label="코스 종류"
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
