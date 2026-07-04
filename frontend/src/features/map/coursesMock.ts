import type {
  Course,
  CourseFilterState,
  CourseListResponse,
  CourseRoute,
  Difficulty,
  LatLng,
  RouteType,
} from "./types";

// 시드 기반 결정적 지그재그 경로 생성기 (부산·남해안 인근 좌표)
function makePath(seed: number, base: LatLng): LatLng[] {
  const pts: LatLng[] = [];
  let { lat, lng } = base;
  for (let i = 0; i < 8; i++) {
    lat += Math.sin(seed * 1.7 + i * 1.3) * 0.012;
    lng += Math.cos(seed * 2.1 + i * 0.9) * 0.016;
    pts.push({ lat: +lat.toFixed(5), lng: +lng.toFixed(5) });
  }
  return pts;
}

// 도보 기준 거리(km)로 자전거 루트를 파생 (자전거가 약 5배 빠름)
function routesFor(distance: number, difficulty: Difficulty, hasBicycle: boolean): CourseRoute[] {
  const routes: CourseRoute[] = [
    { route_type: "도보", distance, estimated_time: Math.round(distance * 22.5), difficulty },
  ];
  if (hasBicycle) {
    routes.push({ route_type: "자전거", distance, estimated_time: Math.round(distance * 4), difficulty });
  }
  return routes;
}

const RAW: Array<{
  id: number;
  title: string;
  start_address: string;
  region_code: string;
  distance: number;
  difficulty: Difficulty;
  hasBicycle: boolean;
  landmarks: string[];
}> = [
  { id: 1, title: "남파랑길 2코스", start_address: "부산 영도구 태종대로", region_code: "26", distance: 19.0, difficulty: "보통", hasBicycle: true, landmarks: ["태종대", "흰여울문화마을", "절영해안산책로"] },
  { id: 2, title: "남파랑길 3코스", start_address: "부산 사하구 다대로", region_code: "26", distance: 14.0, difficulty: "보통", hasBicycle: true, landmarks: ["몰운대", "다대포해수욕장", "아미산전망대"] },
  { id: 3, title: "남파랑길 4코스", start_address: "부산 강서구 녹산산단", region_code: "26", distance: 22.0, difficulty: "어려움", hasBicycle: true, landmarks: ["을숙도", "가덕도", "낙동강하구"] },
  { id: 4, title: "갈맷길 해운대 구간", start_address: "부산 해운대구 우동", region_code: "26", distance: 8.5, difficulty: "쉬움", hasBicycle: false, landmarks: ["해운대해수욕장", "동백섬", "누리마루"] },
  { id: 5, title: "이순신 백의종군로", start_address: "경남 남해군 고현면", region_code: "48", distance: 27.5, difficulty: "어려움", hasBicycle: true, landmarks: ["이순신순국공원", "남해대교", "관음포"] },
  { id: 6, title: "통영 한려해상 둘레길", start_address: "경남 통영시 도남동", region_code: "48", distance: 11.2, difficulty: "보통", hasBicycle: false, landmarks: ["미륵산", "통영케이블카", "달아공원"] },
  { id: 7, title: "여수 금오도 비렁길", start_address: "전남 여수시 남면", region_code: "46", distance: 6.4, difficulty: "쉬움", hasBicycle: false, landmarks: ["함구미마을", "촛대바위", "매봉전망대"] },
  { id: 8, title: "순천만 갈대길", start_address: "전남 순천시 대대동", region_code: "46", distance: 16.8, difficulty: "보통", hasBicycle: true, landmarks: ["순천만습지", "갈대밭", "용산전망대"] },
];

const BASES: Record<string, LatLng> = {
  "26": { lat: 35.1, lng: 129.05 },
  "48": { lat: 34.85, lng: 128.43 },
  "46": { lat: 34.74, lng: 127.74 },
};

export const MOCK_COURSES: Course[] = RAW.map((c) => {
  const trail = makePath(c.id, BASES[c.region_code]);
  return {
    id: c.id,
    title: c.title,
    start_address: c.start_address,
    image_url: "",
    region_code: c.region_code,
    landmarks: c.landmarks,
    routes: routesFor(c.distance, c.difficulty, c.hasBicycle),
    path_trail: trail,
    path_bicycle: c.hasBicycle ? makePath(c.id + 100, BASES[c.region_code]) : [],
  };
});

// 필터 옵션 (Mock 데이터셋에 맞춘 셀렉트 값)
export const REGION_OPTIONS = [
  { value: "", label: "전체 지역" },
  { value: "26", label: "부산" },
  { value: "48", label: "경남" },
  { value: "46", label: "전남" },
];

export const DISTANCE_OPTIONS = [
  { value: "", label: "전체 거리" },
  { value: "short", label: "10km 이하" },
  { value: "mid", label: "10–20km" },
  { value: "long", label: "20km 이상" },
];

export const DIFFICULTY_OPTIONS = [
  { value: "", label: "전체 난이도" },
  { value: "쉬움", label: "쉬움" },
  { value: "보통", label: "보통" },
  { value: "어려움", label: "어려움" },
];

export const SORT_OPTIONS = [
  { value: "nearest", label: "가까운 순" },
  { value: "distance_asc", label: "코스 길이 짧은 순" },
  { value: "distance_desc", label: "코스 길이 긴 순" },
  { value: "time_asc", label: "소요 시간 짧은 순" },
  { value: "time_desc", label: "소요 시간 긴 순" },
];

export const DEFAULT_PAGE_SIZE = 6;

/**
 * 필터 상태 → /api/courses 쿼리 파라미터로 변환.
 * 빈 값은 생략하고 page·size는 항상 포함(명세상 필수).
 * 5주차: `fetch('/api/courses?' + new URLSearchParams(buildCourseQuery(...)))` 형태로 그대로 사용.
 */
export function buildCourseQuery(
  filters: CourseFilterState,
  routeType: RouteType,
  page: number,
  size: number,
  userLoc?: LatLng | null,
): Record<string, string> {
  const q: Record<string, string> = {
    type: routeType, // 주행 타입 (도보/자전거)
    page: String(page),
    size: String(size),
  };
  if (filters.region) q.region = filters.region;
  if (filters.distance) q.distance = filters.distance; // 거리 버킷 (short/mid/long)
  if (filters.difficulty && routeType === "도보") q.difficulty = filters.difficulty; // 난이도는 도보 전용
  if (filters.keyword.trim()) q.keyword = filters.keyword.trim();
  // 가까운 순은 사용자 위치가 있어야 정렬 가능. 없으면 sort 생략 → 기본 순서.
  if (filters.sort === "nearest") {
    if (userLoc) {
      q.sort = "nearest";
      q.lat = String(userLoc.lat);
      q.lng = String(userLoc.lng);
    }
  } else if (filters.sort) {
    q.sort = filters.sort;
  }
  return q;
}

/**
 * Mock 구현: 쿼리 파라미터를 받아 실제 /api/courses 와 동일한 응답 구조를 반환.
 * 5주차에 이 함수 호출만 실 API fetch 로 교체하면 됨(상위 컴포넌트 변경 불필요).
 */
export function getCoursesMock(query: Record<string, string>): CourseListResponse {
  const page = Number(query.page) || 1;
  const size = Number(query.size) || DEFAULT_PAGE_SIZE;
  const type = (query.type as RouteType) || "도보";

  const inBucket = (d: number, b?: string) =>
    b === "short" ? d <= 10 : b === "mid" ? d > 10 && d <= 20 : b === "long" ? d > 20 : true;

  const routeOf = (c: Course) => c.routes.find((r) => r.route_type === type);

  let list = MOCK_COURSES.filter((c) => {
    const route = routeOf(c);
    if (!route) return false; // 선택한 주행 타입이 없는 코스 제외
    if (query.keyword && !c.title.includes(query.keyword)) return false;
    if (query.region && c.region_code !== query.region) return false;
    if (query.difficulty && route.difficulty !== query.difficulty) return false;
    if (!inBucket(route.distance, query.distance)) return false;
    return true;
  });

  const val = (c: Course) => routeOf(c)!;
  if (query.sort === "distance_asc") list = [...list].sort((a, b) => val(a).distance - val(b).distance);
  else if (query.sort === "distance_desc") list = [...list].sort((a, b) => val(b).distance - val(a).distance);
  else if (query.sort === "time_asc") list = [...list].sort((a, b) => val(a).estimated_time - val(b).estimated_time);
  else if (query.sort === "time_desc") list = [...list].sort((a, b) => val(b).estimated_time - val(a).estimated_time);
  else if (query.sort === "nearest" && query.lat && query.lng) {
    // 사용자 위치 → 코스 출발점까지 근사 거리(제곱)로 정렬. 경도는 위도로 보정.
    const ulat = Number(query.lat);
    const ulng = Number(query.lng);
    const origin = (c: Course) => c.path_trail[0] ?? c.path_bicycle[0];
    const dist2 = (c: Course) => {
      const p = origin(c);
      if (!p) return Number.POSITIVE_INFINITY;
      const dlat = p.lat - ulat;
      const dlng = (p.lng - ulng) * Math.cos((ulat * Math.PI) / 180);
      return dlat * dlat + dlng * dlng;
    };
    list = [...list].sort((a, b) => dist2(a) - dist2(b));
  }

  const total_count = list.length;
  const start = (page - 1) * size;
  return { total_count, page, size, courses: list.slice(start, start + size) };
}
