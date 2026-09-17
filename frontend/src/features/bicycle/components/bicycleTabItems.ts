import { tabPanelProps } from "../../../components/common/tabIds";

export type DataSourceTab = "운영 정보" | "실시간";

export const BICYCLE_TABS = [
  { value: "운영 정보", label: "운영 정보" },
  { value: "실시간", label: "실시간" },
] as const satisfies readonly { value: DataSourceTab; label: string }[];

export const BICYCLE_TAB_ID_BASE = "bicycle-source";

/** 탭이 가리키는 목록 영역에 펼쳐 넣는다. */
export function bicycleTabPanelProps(value: DataSourceTab) {
  return tabPanelProps(BICYCLE_TAB_ID_BASE, BICYCLE_TABS.findIndex((tab) => tab.value === value));
}
