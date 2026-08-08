import type {
  Bounds,
  Course,
  CourseDetail,
  CourseListResponse,
  CourseRoute,
  Difficulty,
  LatLng,
  Region,
  RouteDetail,
  RouteType,
} from "./types";

// 백엔드 원본 응답 형태(영어 값·nullable). UI 타입으로 변환하기 전 단계.
interface ApiRoute {
  route_type: string;
  distance: number;
  estimated_time: number | null;
  difficulty: string | null;
  start_lat?: number | null;
  start_lng?: number | null;
  bounds?: Bounds;
}

interface ApiCourse {
  id: number;
  title: string;
  start_address: string | null;
  image_url: string | null;
  region_code: string | null;
  is_population_drop_zone?: boolean;
  landmarks?: string[];
  routes?: ApiRoute[];
  path_trail?: LatLng[];
  path_bicycle?: LatLng[];
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// 프론트(한국어) ↔ 백엔드(영어) 값 매핑.
// 백엔드 DB는 route_type=trail/bicycle, difficulty=easy/medium/hard 로 저장하고
// distance 필터는 "min-max" 범위 문자열을 기대하므로 API 경계에서만 변환한다.
const ROUTE_TO_API: Record<RouteType, string> = { 도보: "trail", 자전거: "bicycle" };
const ROUTE_FROM_API: Record<string, RouteType> = { trail: "도보", bicycle: "자전거" };
const DIFF_TO_API: Record<string, string> = { 쉬움: "easy", 보통: "medium", 어려움: "hard" };
const DIFF_FROM_API: Record<string, Difficulty> = { easy: "쉬움", medium: "보통", hard: "어려움" };
// 거리 버킷 → 백엔드 distance 범위 문자열 ("-10"=10 이하, "20-"=20 이상)
const DISTANCE_TO_API: Record<string, string> = { short: "-10", mid: "10-20", long: "20-" };

/** UI 쿼리(한국어/버킷)를 백엔드가 이해하는 파라미터로 변환한다. */
function toApiQuery(query: Record<string, string>): Record<string, string> {
  const q = { ...query };
  if (q.type) q.type = ROUTE_TO_API[q.type as RouteType] ?? q.type;
  if (q.difficulty) q.difficulty = DIFF_TO_API[q.difficulty] ?? q.difficulty;
  if (q.distance) q.distance = DISTANCE_TO_API[q.distance] ?? q.distance;
  return q;
}

/** 응답의 영어 route_type/difficulty를 UI용 한국어로 변환한다. */
function fromApiCourse(c: ApiCourse): Course {
  const routes: CourseRoute[] = (c.routes ?? []).map((r) => ({
    route_type: ROUTE_FROM_API[r.route_type] ?? r.route_type,
    distance: r.distance,
    estimated_time: r.estimated_time ?? 0,
    // 자전거 경로는 난이도가 null일 수 있으나 UI(도보 전용)에서 미표시되므로 그대로 둔다.
    difficulty: (r.difficulty != null ? DIFF_FROM_API[r.difficulty] ?? r.difficulty : r.difficulty) as Difficulty,
  }));
  return {
    id: c.id,
    title: c.title,
    start_address: c.start_address ?? "",
    image_url: c.image_url ?? "",
    region_code: c.region_code ?? "",
    is_population_drop_zone: c.is_population_drop_zone ?? false,
    landmarks: c.landmarks ?? [],
    routes,
    path_trail: c.path_trail ?? [],
    path_bicycle: c.path_bicycle ?? [],
  };
}

/**
 * 공통 GET 헬퍼. 네트워크 실패(서버 다운·오프라인)와 HTTP 오류를
 * 사용자용 한국어 메시지로 변환한다. (fetch 자체가 throw하는 "Failed to fetch" 노출 방지)
 */
async function apiGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`);
  } catch {
    throw new Error("서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");
  }
  if (!res.ok) throw new Error(`불러오지 못했어요 (${res.status})`);
  return res.json();
}

interface ApiListResponse {
  total_count: number;
  page: number;
  size: number;
  courses?: ApiCourse[];
}

type ApiCourseDetail = ApiCourse & {
  description?: string;
  original_gpx_url?: string;
};

/**
 * GET /api/courses — 코스 목록 조회.
 * getCoursesMock 과 동일한 (query) → CourseListResponse 시그니처라 호출부는 교체만 하면 된다.
 */
export async function getCourses(query: Record<string, string>): Promise<CourseListResponse> {
  const params = new URLSearchParams(toApiQuery(query));
  const data = await apiGet<ApiListResponse>(`/api/courses?${params}`);
  return {
    total_count: data.total_count,
    page: data.page,
    size: data.size,
    courses: (data.courses ?? []).map(fromApiCourse),
  };
}

/** GET /api/courses/{id} — 코스 상세. route_type/difficulty를 UI용 한국어로 변환한다. */
export async function getCourseDetail(id: number): Promise<CourseDetail> {
  const c = await apiGet<ApiCourseDetail>(`/api/courses/${id}`);
  const routes: RouteDetail[] = (c.routes ?? []).map((r) => ({
    route_type: ROUTE_FROM_API[r.route_type] ?? r.route_type,
    distance: r.distance,
    estimated_time: r.estimated_time ?? 0,
    difficulty: (r.difficulty != null ? DIFF_FROM_API[r.difficulty] ?? r.difficulty : r.difficulty) as Difficulty,
    start_lat: r.start_lat ?? null,
    start_lng: r.start_lng ?? null,
    bounds: r.bounds ?? { min_lat: 0, max_lat: 0, min_lng: 0, max_lng: 0 },
  }));
  return {
    id: c.id,
    title: c.title,
    description: c.description ?? "",
    start_address: c.start_address ?? "",
    region_code: c.region_code ?? "",
    image_url: c.image_url ?? "",
    original_gpx_url: c.original_gpx_url ?? "",
    is_population_drop_zone: c.is_population_drop_zone ?? false,
    routes,
  };
}

/** GET /api/regions — 코스 보유 지역만. 지역 필터 드롭다운 데이터원. */
export async function getRegions(): Promise<Region[]> {
  return apiGet<Region[]>("/api/regions");
}

/** GET /api/courses/{id}/gpx — 선택 주행방식의 전체 경로 좌표(폴리라인용). */
export async function getCourseGpx(id: number, routeType: RouteType): Promise<LatLng[]> {
  const route_type = ROUTE_TO_API[routeType] ?? "trail";
  const data = await apiGet<{ waypoints?: LatLng[] }>(`/api/courses/${id}/gpx?route_type=${route_type}`);
  return data.waypoints ?? [];
}
