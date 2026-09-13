import type { NearbySpot, SpotCategory } from "./types";
import { HttpError } from "../../lib/http";

// ??가 아니라 ||인 이유: .env에 VITE_API_BASE_URL=처럼 빈 값으로 두면 ??는 ""를
// 그대로 통과시켜 요청이 상대경로로 나가고 404가 된다. 빈 값도 폴백으로 보낸다.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

interface ApiNearbySpot {
  id: string;
  category: string;
  name: string;
  address: string | null;
  image_url: string | null;
  lat: number;
  lng: number;
  distance_m: number;
  duration_minutes: number;
}

interface ApiNearbyResponse {
  total_count: number;
  spots: ApiNearbySpot[];
}

export interface NearbySpotsPage {
  totalCount: number;
  spots: NearbySpot[];
}

export const PAGE_SIZE = 20;

// 사용자 문구로 바꾸지 않는다. 네트워크 실패는 fetch의 TypeError를 그대로 두고,
// HTTP 오류는 HttpError로 던진다. 화면 문구 변환은 컴포넌트가 toUserError로 한다.
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new HttpError(res.status, `불러오지 못했어요 (${res.status})`);
  return res.json();
}

function fromApiSpot(s: ApiNearbySpot): NearbySpot {
  return {
    id: s.id,
    category: s.category as SpotCategory,
    name: s.name,
    address: s.address ?? "",
    image_url: s.image_url ?? "",
    lat: s.lat,
    lng: s.lng,
    distance_m: s.distance_m,
    duration_minutes: s.duration_minutes,
  };
}

/**
 * GET /api/courses/{id}/nearby — 코스 주변 스팟 목록.
 */
export async function getNearbySpots(
  courseId: number,
  category: SpotCategory,
  routeType: "trail" | "bicycle" = "trail",
  page: number = 1
): Promise<NearbySpotsPage> {
  const params = new URLSearchParams({
    category,
    route_type: routeType,
    page: String(page),
    size: String(PAGE_SIZE),
  });
  const data = await apiGet<ApiNearbyResponse>(`/api/courses/${courseId}/nearby?${params}`);
  return { totalCount: data.total_count, spots: data.spots.map(fromApiSpot) };
}

interface ApiBicycleFacilityDetail {
  id: number;
  facility_title: string;
  addr1: string | null;
  rental_fee_type: string | null;
  repair_available: boolean | null;
  open_hours: string | null;
  total_bikes: number | null;
  available_bikes: number | null;
}

// 파라미터(id)는 string, 응답(ApiBicycleFacilityDetail.id)은 number로 서로 다르다.
// 이 함수를 호출하는 spot.id는 courses/{id}/nearby 목록 응답(NearbySpotOut.id: str)에서
// 온 값이라 string이고, 그 목록 API가 관광지(content_id, 원래 string)와 자전거
// (bicycle_id, 원래 int)를 같은 필드로 통합하며 string으로 맞춘 결과다.
export async function getBicycleFacilityDetail(id: string) {   // 파라미터 — spot.id(string)를 그대로 받음
  return apiGet<ApiBicycleFacilityDetail>(`/api/bicycle-facilities/${id}`);
}

interface ApiTourSpotDetail {
  content_id: string;
  content_type_id: string;
  tour_spot_title: string;
  addr1: string | null;
  detail: Record<string, string | null>;
}

export async function getTourSpotDetail(contentId: string) {
  return apiGet<ApiTourSpotDetail>(`/api/tour-spots/${contentId}`);
}
