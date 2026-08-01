// 대회 API
// - USE_MOCK = true 인 동안은 raceMock 데이터 반환
// - 실제 API로 교체 시 USE_MOCK = false 로 설정하면 fetch 분기로 전환됨

import type { Race } from "./types";
import { mockRaces as raceMock } from "./raceMock";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const USE_MOCK = false;

interface ApiRaceListResponse {
  total: number;
  page: number;
  per_page: number;
  items: Race[];
}

export interface RaceListQuery {
  region_code?: string;
  event_type?: "running" | "cycling";
  upcoming_only?: boolean;
  page?: number;
  per_page?: number;
}

export async function fetchRaceList(query: RaceListQuery = {}): Promise<Race[]> {
  if (USE_MOCK) return raceMock;

  const params = new URLSearchParams();
  if (query.region_code) params.set("region_code", query.region_code);
  if (query.event_type) params.set("event_type", query.event_type);
  if (query.upcoming_only !== undefined) {
    params.set("upcoming_only", String(query.upcoming_only));
  }
  params.set("page", String(query.page ?? 1));
  params.set("per_page", String(query.per_page ?? 100));

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/races?${params}`);
  } catch {
    throw new Error("서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");
  }
  if (!res.ok) throw new Error(`대회 목록 조회 실패 (${res.status})`);

  const data: ApiRaceListResponse = await res.json();
  return data.items;
}

export async function fetchRaceDetail(eventId: number): Promise<Race> {
  if (USE_MOCK) {
    const found = raceMock.find((r) => r.event_id === eventId);
    if (!found) throw new Error("해당 대회를 찾을 수 없습니다");
    return found;
  }

  const res = await fetch(`${API_BASE}/api/races/${eventId}`);
  if (!res.ok) throw new Error(`대회 상세 조회 실패 (${res.status})`);
  return res.json();
}

export interface NearbyAccommodation {
  content_id: string;
  tour_spot_title: string;
  addr1: string | null;
  first_image: string | null;
  distance_km: number;
  map_x: number | null;
  map_y: number | null;
}

export async function fetchNearbyAccommodations(
  eventId: number,
  radiusKm: number = 5
): Promise<NearbyAccommodation[]> {
  const res = await fetch(
    `${API_BASE}/api/races/${eventId}/nearby-accommodations?radius_km=${radiusKm}`
  );
  if (!res.ok) throw new Error(`주변 숙박 조회 실패 (${res.status})`);
  return res.json();
}