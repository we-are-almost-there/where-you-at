import type { RouteType } from "../types";
import { tabPanelProps } from "../../../components/common/tabIds";

export const COURSE_TABS = [
  { value: "도보", label: "도보" },
  { value: "자전거", label: "자전거" },
] as const satisfies readonly { value: RouteType; label: string }[];

export const COURSE_TAB_ID_BASE = "course-route-type";

/** 탭이 가리키는 목록 영역에 펼쳐 넣는다. */
export function courseTabPanelProps(value: RouteType) {
  return tabPanelProps(COURSE_TAB_ID_BASE, COURSE_TABS.findIndex((tab) => tab.value === value));
}
