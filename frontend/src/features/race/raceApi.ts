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

  // page를 명시적으로 지정한 호출부는 그 페이지만 반환(추후 페이지네이션 UI 대비).
  // page 미지정 시(현재 모든 호출부)에는 total을 다 채울 때까지 이어서 가져와
  // per_page 상한 때문에 나머지 데이터가 조용히 누락되는 일이 없게 한다.
  const shouldFetchAll = query.page === undefined;
  const perPage = query.per_page ?? 100;

  const buildParams = (page: number) => {
    const params = new URLSearchParams();
    if (query.region_code) params.set("region_code", query.region_code);
    if (query.event_type) params.set("event_type", query.event_type);
    if (query.upcoming_only !== undefined) {
      params.set("upcoming_only", String(query.upcoming_only));
    }
    params.set("page", String(page));
    params.set("per_page", String(perPage));
    return params;
  };

  const fetchPage = async (page: number): Promise<ApiRaceListResponse> => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/races?${buildParams(page)}`);
    } catch {
      throw new Error("서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");
    }
    if (!res.ok) throw new Error(`대회 목록 조회 실패 (${res.status})`);
    return res.json();
  };

  if (!shouldFetchAll) {
    const data = await fetchPage(query.page ?? 1);
    return data.items;
  }

  const allItems: Race[] = [];
  let page = 1;
  let total = Infinity;
  while (allItems.length < total) {
    const data = await fetchPage(page);
    allItems.push(...data.items);
    total = data.total;
    if (data.items.length === 0) break; // 안전장치: 무한 루프 방지
    page += 1;
  }
  return allItems;
}

// TODO: 대회 상세 페이지에서 목록 API 응답이 아닌 단건 조회가 필요해지면 사용.
// 현재 상세 화면은 목록에서 선택한 Race 객체를 그대로 재사용하고 있어 아직 미사용.
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

// TODO: 대회 상세 화면에 주변 숙박 섹션 재도입 시 사용 예정.
// 백엔드 엔드포인트(GET /api/races/{id}/nearby-accommodations)는 이미 구현되어 있음.
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
