import type { NearbySpot, SpotCategory } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

interface ApiNearbySpot {
  id: number;
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

export async function apiGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`);
  } catch {
    throw new Error("서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");
  }
  if (!res.ok) throw new Error(`불러오지 못했어요 (${res.status})`);
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

export async function getBicycleFacilityDetail(id: number) {
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