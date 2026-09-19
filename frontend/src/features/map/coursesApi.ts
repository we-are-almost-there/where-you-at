import type {
  Bounds,
  Course,
  CourseDetail,
  CourseListResponse,
  CourseRoute,
  CourseStart,
  Difficulty,
  LatLng,
  Region,
  RouteDetail,
  RouteType,
} from "./types";
import { fetchOrNetworkError, HttpError } from "../../lib/http";

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

export interface ApiCourse {
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

interface ApiCourseStart {
  id: number;
  title: string;
  start_address: string | null;
  image_url: string | null;
  region_code: string | null;
  routes?: ApiRoute[];
  start: LatLng | null;
}

// ??가 아니라 ||인 이유: .env에 VITE_API_BASE_URL=처럼 빈 값으로 두면 ??는 ""를
// 그대로 통과시켜 요청이 상대경로로 나가고 404가 된다. 빈 값도 폴백으로 보낸다.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// '가까운 순'을 브라우저에서 정렬하려고 전체 목록을 받을 때 한 번에 요청하는 개수. 백엔드 size 상한과 같다.
const ALL_COURSES_PAGE_SIZE = 500;

// 프론트(한국어) ↔ 백엔드(영어) 값 매핑.
// 백엔드 DB는 route_type=trail/bicycle, difficulty=easy/medium/hard 로 저장하고
// distance 필터는 "min-max" 범위 문자열을 기대하므로 API 경계에서만 변환한다.
const ROUTE_TO_API: Record<RouteType, string> = { 도보: "trail", 자전거: "bicycle" };
const ROUTE_FROM_API: Record<string, RouteType> = { trail: "도보", bicycle: "자전거" };
const DIFF_TO_API: Record<string, string> = { 쉬움: "easy", 보통: "medium", 어려움: "hard" };
const DIFF_FROM_API: Record<string, Difficulty> = { easy: "쉬움", medium: "보통", hard: "어려움" };
// 거리 버킷 → 백엔드 distance 범위 문자열 ("-10"=10 이하, "20-"=20 이상)
const DISTANCE_TO_API: Record<string, string> = { short: "-10", mid: "10-20", long: "20-" };

/**
 * TourAPI 이미지(tong.visitkorea.or.kr)가 대부분 http로 내려온다.
 * HTTPS로 배포하면 브라우저가 혼합 콘텐츠로 차단하므로 API 경계에서 https로 올린다.
 * 같은 호스트가 https도 유효한 인증서로 응답한다.
 */
function toHttpsImage(url: string | null | undefined): string {
  return (url ?? "").replace(/^http:\/\//, "https://");
}

/** UI 쿼리(한국어/버킷)를 백엔드가 이해하는 파라미터로 변환한다. */
function toApiQuery(query: Record<string, string>): Record<string, string> {
  const q = { ...query };
  if (q.type) q.type = ROUTE_TO_API[q.type as RouteType] ?? q.type;
  if (q.difficulty) q.difficulty = DIFF_TO_API[q.difficulty] ?? q.difficulty;
  if (q.distance) q.distance = DISTANCE_TO_API[q.distance] ?? q.distance;
  return q;
}

/** 응답의 영어 route_type/difficulty를 UI용 한국어로 변환한다. */
function fromApiRoute(r: ApiRoute): CourseRoute {
  return {
    route_type: ROUTE_FROM_API[r.route_type] ?? r.route_type,
    distance: r.distance,
    estimated_time: r.estimated_time ?? 0,
    // 자전거 경로는 난이도가 null일 수 있으나 UI(도보 전용)에서 미표시되므로 그대로 둔다.
    difficulty: (r.difficulty != null ? DIFF_FROM_API[r.difficulty] ?? r.difficulty : r.difficulty) as Difficulty,
  };
}

/** UI 종목 → 백엔드 값. 찜 API도 같은 경계 변환을 쓴다. */
export function toApiRouteType(routeType: RouteType): string {
  return ROUTE_TO_API[routeType] ?? routeType;
}

/** 백엔드 종목 → UI 종목. */
export function fromApiRouteType(routeType: string): RouteType {
  return ROUTE_FROM_API[routeType] ?? (routeType as RouteType);
}

/** 코스 목록 응답 항목 → UI 코스. 찜한 코스 목록이 같은 카드를 쓰므로 함께 쓴다. */
export function fromApiCourse(c: ApiCourse): Course {
  return {
    id: c.id,
    title: c.title,
    start_address: c.start_address ?? "",
    image_url: toHttpsImage(c.image_url),
    region_code: c.region_code ?? "",
    is_population_drop_zone: c.is_population_drop_zone ?? false,
    landmarks: c.landmarks ?? [],
    routes: (c.routes ?? []).map(fromApiRoute),
    path_trail: c.path_trail ?? [],
    path_bicycle: c.path_bicycle ?? [],
  };
}

/**
 * 공통 GET 헬퍼. 사용자 문구로 바꾸지 않는다.
 * 네트워크 실패(서버 다운·오프라인)는 NetworkError로, HTTP 오류는 HttpError로 던진다.
 * 화면 문구 변환은 컴포넌트가 toUserError로 한다.
 */
async function apiGet<T>(path: string): Promise<T> {
  const res = await fetchOrNetworkError(`${API_BASE}${path}`);
  if (!res.ok) throw new HttpError(res.status, `불러오지 못했어요 (${res.status})`);
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

// 전체 목록 요청에 실어 보낼 수 있는 필터. 이용자 위치(lat·lng)나 정렬이 섞여 나가지 않도록
// 지워야 할 키를 고르는 대신 보낼 키만 고른다.
// 코스 필터를 새로 만들면(buildCourseQuery) 여기에도 추가한다. 빠뜨리면 '가까운 순'에서만 그 필터가 조용히 무시된다.
const ALL_COURSES_FILTER_KEYS = ["type", "region", "distance", "difficulty", "keyword"] as const;

/**
 * 필터에 맞는 코스를 모두 받는다. '가까운 순'을 브라우저에서 정렬할 때 쓴다(nearestSort.ts).
 * 이용자 위치는 보내지 않는다. query에서 필터(ALL_COURSES_FILTER_KEYS)만 골라 서버 기본 순서로 전체를 모은다.
 */
export async function getAllCourses(query: Record<string, string>): Promise<Course[]> {
  const filters: Record<string, string> = {};
  for (const key of ALL_COURSES_FILTER_KEYS) {
    if (query[key]) filters[key] = query[key];
  }

  const courses: Course[] = [];
  for (let page = 1; ; page++) {
    const res = await getCourses({ ...filters, page: String(page), size: String(ALL_COURSES_PAGE_SIZE) });
    courses.push(...res.courses);
    if (res.courses.length === 0 || courses.length >= res.total_count) return courses;
  }
}

/**
 * GET /api/courses/starts — 도보 경로가 있는 모든 코스의 출발점과 카드 정보.
 * 홈 '가까운 코스'를 브라우저에서 고르는 데 쓴다. 위치와 상관없이 항상 같은 전체 목록을 받는다.
 * 위치를 못 얻었을 때의 기본 목록(type=trail)과 같은 범위라 자전거 전용 코스는 없다.
 */
export async function getCourseStarts(): Promise<CourseStart[]> {
  const data = await apiGet<ApiCourseStart[]>("/api/courses/starts");
  return data.map((c) => ({
    id: c.id,
    title: c.title,
    start_address: c.start_address ?? "",
    image_url: toHttpsImage(c.image_url),
    region_code: c.region_code ?? "",
    routes: (c.routes ?? []).map(fromApiRoute),
    start: c.start ?? null,
  }));
}

/** GET /api/courses/{id} — 코스 상세. route_type/difficulty를 UI용 한국어로 변환한다. */
export async function getCourseDetail(id: number): Promise<CourseDetail> {
  const c = await apiGet<ApiCourseDetail>(`/api/courses/${id}`);
  const routes: RouteDetail[] = (c.routes ?? []).map((r) => ({
    ...fromApiRoute(r),
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
    image_url: toHttpsImage(c.image_url),
    original_gpx_url: c.original_gpx_url ?? "",
    is_population_drop_zone: c.is_population_drop_zone ?? false,
    routes,
  };
}

/** GET /api/regions — 코스 보유 지역만. routeType을 주면 그 경로가 있는 지역으로 한정한다. */
export async function getRegions(routeType?: RouteType): Promise<Region[]> {
  const apiType = routeType ? ROUTE_TO_API[routeType] : null;
  return apiGet<Region[]>(`/api/regions${apiType ? `?type=${apiType}` : ""}`);
}

/** GET /api/courses/{id}/gpx — 선택 주행방식의 전체 경로 좌표(폴리라인용). */
export async function getCourseGpx(id: number, routeType: RouteType): Promise<LatLng[]> {
  const route_type = ROUTE_TO_API[routeType] ?? "trail";
  const data = await apiGet<{ waypoints?: LatLng[] }>(`/api/courses/${id}/gpx?route_type=${route_type}`);
  return data.waypoints ?? [];
}
