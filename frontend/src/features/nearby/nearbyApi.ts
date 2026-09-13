import type { NearbySpot, SpotCategory } from "./types";

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
  list_version: string;
}

export interface NearbySpotsPage {
  totalCount: number;
  spots: NearbySpot[];
  listVersion: string;
}

export const PAGE_SIZE = 20;

const REQUEST_TIMEOUT_MS = 10000;

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
  } catch {
    if (signal?.aborted) {
      // 언마운트 등 호출부의 의도적 취소 — 호출부가 구분해서 무시할 수 있게 AbortError로 던진다.
      throw new DOMException("Aborted", "AbortError");
    }
    // 타임아웃이든 일반 네트워크 오류든 사용자에게는 동일하게 안내한다. 추후 에러 문구 분기 예정
    throw new Error("서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onExternalAbort);
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
  page: number = 1,
  signal?: AbortSignal
): Promise<NearbySpotsPage> {
  const params = new URLSearchParams({
    category,
    route_type: routeType,
    page: String(page),
    size: String(PAGE_SIZE),
  });
  const data = await apiGet<ApiNearbyResponse>(`/api/courses/${courseId}/nearby?${params}`, signal);
  return {
    totalCount: data.total_count,
    spots: data.spots.map(fromApiSpot),
    listVersion: data.list_version,
  };
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
