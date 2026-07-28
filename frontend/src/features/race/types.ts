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

export const EVENT_TYPE_COLOR: Record<EventType, string> = {
  running: "#6C5CE7", // 프로젝트 기본 accent
  cycling: "#00B894", // 러닝과 구분되는 보조 accent
};