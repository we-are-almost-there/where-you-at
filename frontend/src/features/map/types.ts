// /api/courses 응답 구조에 맞춘 타입 (4주차 Mock 단계)
// 주의: 명세서상 route_type / difficulty 는 str 이지만, Mock 표시·필터 편의를 위해
// 한국어 리터럴로 좁혀둠. 5주차 실 API 연동 시 백엔드 실제 값과 대조 필요.

export type RouteType = "도보" | "자전거";
export type Difficulty = "쉬움" | "보통" | "어려움";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface CourseRoute {
  route_type: RouteType;
  distance: number; // km
  estimated_time: number; // 분
  difficulty: Difficulty;
}

export interface Course {
  id: number;
  title: string;
  start_address: string;
  image_url: string;
  region_code: string;
  is_population_drop_zone: boolean; // 인구감소지역 여부 (카드 뱃지 표시용)
  landmarks: string[]; // 코스 대표 관광지 (카드 칩 표시용)
  routes: CourseRoute[];
  path_trail: LatLng[]; // 썸네일용 단순화 좌표
  path_bicycle: LatLng[]; // 자전거 없으면 []
}

// GET /api/courses/starts 응답 항목 — 홈 '가까운 코스'를 브라우저에서 고르기 위한 가벼운 목록.
// 도보 경로가 있는 코스만 담고(위치를 못 얻었을 때의 기본 목록과 같은 범위), 썸네일 경로 대신 출발점만 담는다.
// 이용자 위치는 서버로 보내지 않는다.
export interface CourseStart {
  id: number;
  title: string;
  start_address: string;
  image_url: string;
  region_code: string;
  routes: CourseRoute[];
  start: LatLng | null; // 도보 경로 출발점 (좌표가 비어 있으면 null)
}

// GET /api/courses 응답 본문 (페이지네이션 래퍼)
export interface CourseListResponse {
  total_count: number;
  page: number;
  size: number;
  courses: Course[];
}

// 코스 경계 좌표 (지도 fit 용)
export interface Bounds {
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
}

// 상세(GET /api/courses/{id})의 주행방식별 경로 — 목록보다 필드가 많다
export interface RouteDetail extends CourseRoute {
  start_lat: number | null;
  start_lng: number | null;
  bounds: Bounds;
}

// GET /api/courses/{id} 응답 본문
export interface CourseDetail {
  id: number;
  title: string;
  description: string;
  start_address: string;
  region_code: string;
  image_url: string;
  original_gpx_url: string;
  is_population_drop_zone: boolean;
  routes: RouteDetail[];
}

// GET /api/regions 응답 항목 (코스 보유 지역만)
export interface Region {
  region_code: string; // 5자리 시군구 코드
  name: string; // 시군구명 (예: 통영시)
  sido: string; // 시도명 (예: 경상남도)
  is_population_drop: boolean;
}

// 필터 UI 상태 (입력 위젯 값)
export interface CourseFilterState {
  keyword: string;
  region: string; // "" = 전체
  distance: string; // "" | "short" | "mid" | "long"
  difficulty: string; // "" | Difficulty
  sort: string; // "nearest" | "distance_asc" | "distance_desc" | "time_asc" | "time_desc"
}
