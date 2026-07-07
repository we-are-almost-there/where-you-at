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
  landmarks: string[]; // 코스 대표 관광지 (카드 칩 표시용)
  routes: CourseRoute[];
  path_trail: LatLng[]; // 썸네일용 단순화 좌표
  path_bicycle: LatLng[]; // 자전거 없으면 []
}

// GET /api/courses 응답 본문 (페이지네이션 래퍼)
export interface CourseListResponse {
  total_count: number;
  page: number;
  size: number;
  courses: Course[];
}

// 필터 UI 상태 (입력 위젯 값)
export interface CourseFilterState {
  keyword: string;
  region: string; // "" = 전체
  distance: string; // "" | "short" | "mid" | "long"
  difficulty: string; // "" | Difficulty
  sort: string; // "nearest" | "distance_asc" | "distance_desc" | "time_asc" | "time_desc"
}
