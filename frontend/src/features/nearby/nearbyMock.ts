import type { NearbySpot, SpotCategory } from "./types";

type RawSpot = Omit<NearbySpot, "id" | "category" | "walk_minutes">;

const RAW: Record<SpotCategory, RawSpot[]> = {
  attraction: [
    {
      name: "태종대 유원지",
      address: "부산광역시 영도구 전망로 24",
      image_url: "https://picsum.photos/seed/ts2/400/300",
      distance_m: 1500,
      info_center: "051-405-2004",
      rest_date: "연중무휴",
      use_time: "04:00 - 24:00",
      parking: "가능",
      use_fee: "무료",
    },
    {
      name: "송도해상케이블카",
      address: "부산광역시 서구 송도해변로 171",
      image_url: "https://picsum.photos/seed/ts3/400/300",
      distance_m: 2400,
      info_center: "051-247-9900",
      rest_date: "연중무휴",
      use_time: "09:00 - 22:00",
      parking: "가능",
      use_fee: "왕복 22,000원",
    },
    {
      name: "감천문화마을",
      address: "부산광역시 사하구 감내2로 203",
      image_url: "https://picsum.photos/seed/ts4/400/300",
      distance_m: 3100,
      info_center: "051-204-1444",
      rest_date: "연중무휴",
      use_time: "09:00 - 18:00",
      parking: "가능",
      use_fee: "무료",
    },
    {
      name: "다대포해수욕장",
      address: "부산광역시 사하구 몰운대1길 14",
      image_url: "https://picsum.photos/seed/ts5/400/300",
      distance_m: 4200,
      info_center: "051-265-6863",
      use_time: "상시 개방",
      parking: "가능",
      use_fee: "무료",
    },
  ],
  restaurant: [
    {
      name: "자갈치시장",
      address: "부산광역시 중구 자갈치해안로 52",
      image_url: "https://picsum.photos/seed/ts6/400/300",
      distance_m: 2800,
      first_menu: "활어회",
      treat_menu: "회, 건어물, 젓갈",
      open_time: "05:00 - 22:00",
      rest_date: "매월 둘째·넷째 화요일",
    },
    {
      name: "부산 씨푸드 뷔페",
      address: "부산광역시 해운대구 마린시티1로 26",
      image_url: "https://picsum.photos/seed/ts7/400/300",
      distance_m: 6500,
      first_menu: "씨푸드 뷔페",
      treat_menu: "랍스터, 대게, 초밥",
      open_time: "11:30 - 21:30",
      rest_date: "연중무휴",
    },
    {
      name: "용원어시장 횟집거리",
      address: "부산광역시 강서구 용원로 55",
      image_url: "",
      distance_m: 5200,
      first_menu: "활어회",
      treat_menu: "회, 매운탕",
      open_time: "10:00 - 21:00",
      rest_date: "매주 월요일",
    },
  ],
  accommodation: [
    {
      name: "파크 하얏트 부산",
      address: "부산광역시 해운대구 마린시티2로 51",
      image_url: "https://picsum.photos/seed/ts9/400/300",
      distance_m: 6800,
      checkin_time: "15:00",
      checkout_time: "12:00",
      parking: "가능",
      reservation_url: "https://www.hyatt.com",
    },
    {
      name: "해운대 비치 호텔",
      address: "부산광역시 해운대구 해운대해변로 296",
      image_url: "https://picsum.photos/seed/ts10/400/300",
      distance_m: 7100,
      checkin_time: "15:00",
      checkout_time: "11:00",
      parking: "가능",
    },
  ],
  bicycle: [
    {
      name: "영도 공영자전거 대여소",
      address: "부산광역시 영도구 태종로 100",
      image_url: "",
      distance_m: 300,
      business_hours: "06:00 - 22:00 · 연중무휴",
      parking_available: true,
    },
    {
      name: "절영로 자전거 정비소",
      address: "부산광역시 영도구 절영로 88",
      image_url: "",
      distance_m: 1050,
      business_hours: "09:00 - 19:00 · 매주 일요일 휴무",
      parking_available: false,
    },
  ],
};

export function getNearbySpotsMock(courseId: number, category: SpotCategory | "all"): NearbySpot[] {
  const cats: SpotCategory[] =
    category === "all" ? ["attraction", "restaurant", "accommodation", "bicycle"] : [category];

  return cats
    .flatMap((c) =>
      RAW[c].map((raw, i) => ({
        id: courseId * 1000 + c.charCodeAt(0) * 10 + i,
        category: c,
        walk_minutes: Math.round(raw.distance_m / 67),
        ...raw,
      })),
    )
    .sort((a, b) => a.distance_m - b.distance_m);
}