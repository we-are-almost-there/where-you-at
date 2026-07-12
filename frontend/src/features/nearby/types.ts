export type SpotCategory = "attraction" | "restaurant" | "accommodation" | "bicycle";

export interface CategoryMeta {
  label: string;
  badgeBg: string;
  badgeText: string;
}

export const CATEGORY_META: Record<SpotCategory, CategoryMeta> = {
  attraction: { label: "관광지", badgeBg: "bg-accent/10", badgeText: "text-accent" },
  restaurant: { label: "음식점", badgeBg: "bg-[#FFE8E2]", badgeText: "text-[#FF6B4A]" },
  accommodation: { label: "숙박", badgeBg: "bg-[#DFF5F1]", badgeText: "text-[#0FA98C]" },
  bicycle: { label: "자전거", badgeBg: "bg-[#E4F0FF]", badgeText: "text-[#2E7DD6]" },
};

export const CATEGORY_ORDER: SpotCategory[] = ["attraction", "restaurant", "accommodation", "bicycle"];

export interface NearbySpot {
  id: number;
  category: SpotCategory;
  name: string;
  address: string;
  image_url: string;
  distance_m: number;
  walk_minutes: number;

  // 관광지 (attraction 테이블)
  info_center?: string;
  rest_date?: string;
  use_time?: string;
  parking?: string;
  use_fee?: string;

  // 음식점 (restaurant 테이블)
  first_menu?: string;
  treat_menu?: string;
  open_time?: string;
  // rest_date는 관광지와 공유 필드명

  // 숙박 (accommodation 테이블)
  checkin_time?: string;
  checkout_time?: string;
  reservation_url?: string;
  // parking은 관광지와 공유 필드명

  // 자전거 (별도 공공자전거 API, DB 스키마 없음 — 커스텀)
  business_hours?: string;
  parking_available?: boolean;
}