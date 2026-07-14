import type { NearbySpot, SpotCategory } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

interface ApiNearbySpot {
  id: number;
  category: string;
  name: string;
  address: string | null;
  image_url: string | null;
  distance_m: number;
  duration_minutes: number;
}

interface ApiNearbyResponse {
  total_count: number;
  spots: ApiNearbySpot[];
}

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

function fromApiSpot(s: ApiNearbySpot): NearbySpot {
  return {
    id: s.id,
    category: s.category as SpotCategory,
    name: s.name,
    address: s.address ?? "",
    image_url: s.image_url ?? "",
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
  routeType: "trail" | "bicycle" = "trail"
): Promise<NearbySpot[]> {
  if (category === "bicycle") return []; // 자전거 카테고리는 백엔드 미지원(공공자전거 API 별도 연동 필요)

  const params = new URLSearchParams({
    category,
    route_type: routeType,
    page: "1",
    size: "20",
  });
  const data = await apiGet<ApiNearbyResponse>(`/api/courses/${courseId}/nearby?${params}`);
  return data.spots.map(fromApiSpot);
}