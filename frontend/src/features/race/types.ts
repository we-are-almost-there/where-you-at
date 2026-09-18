export type EventType = "running" | "cycling";

export interface Race {
  event_id: number;
  source: string;
  race_title: string;
  event_type: EventType | null;
  start_date: string; // "YYYY-MM-DD"
  end_date: string | null;
  location_name: string | null;
  map_x: number | null;
  map_y: number | null;
  region_code: string | null;
  contact: string | null;
  homepage_url: string | null;
}

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  running: "러닝",
  cycling: "자전거",
};

// 값의 출처는 index.css의 @theme 토큰(--color-race-running/--color-race-cycling)이며,
// 여기서는 그 값을 그대로 참조만 한다. 인라인 style={{ backgroundColor: ... }}로 쓰는
// 곳이 많아 var()로 넘겨도 문제없이 렌더링된다.
export const EVENT_TYPE_COLOR: Record<EventType, string> = {
  running: "var(--color-race-running)",
  cycling: "var(--color-race-cycling)",
};

// 흰 글자를 올리는 배지·캘린더 칸 배경. 위 종목색은 점·범례용이라 자전거색 위 흰 글자가 2.54:1이다.
export const EVENT_TYPE_BADGE_COLOR: Record<EventType, string> = {
  running: "var(--color-race-running)", // 흰 글자 4.86
  cycling: "var(--color-race-cycling-strong)", // 흰 글자 5.26
};
export const UNSPECIFIED_BADGE_COLOR = "var(--color-race-unspecified-strong)"; // 흰 글자 5.36
