import type { BicycleFacility, BicycleFacilityListResponse } from "./types";
import { fetchOrNetworkError, HttpError } from "../../lib/http";
interface ApiBicycleFacility {
  id: number;
  facility_title: string;
  addr1: string | null;
  map_x: number;
  map_y: number;
  facility_type: string;
  rental_fee_type: string | null;
  repair_available: boolean | null;
  open_hours: string | null;
  total_bikes: number | null;
  available_bikes: number | null;
  region_code: string | null;
  realtime_synced_at: string | null;
}

export interface BicycleRegionOption {
  region_code: string;
  name: string;
  sido: string;
}

export interface BicycleSubregionOption {
  region_code: string;
  name: string;
  cnt: number;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/**
 * 공통 GET 헬퍼. coursesApi.ts와 동일하게 사용자 문구로 바꾸지 않는다.
 * 네트워크 실패는 NetworkError로, HTTP 오류는 HttpError로 던진다.
 */
async function apiGet<T>(path: string): Promise<T> {
  const res = await fetchOrNetworkError(`${API_BASE}${path}`);
  if (!res.ok) throw new HttpError(res.status, `불러오지 못했어요 (${res.status})`);
  return res.json();
}

function fromApiFacility(f: ApiBicycleFacility): BicycleFacility {
  return {
    id: f.id,
    facility_title: f.facility_title,
    addr1: f.addr1 ?? "",
    map_x: f.map_x,
    map_y: f.map_y,
    facility_type: f.facility_type,
    rental_fee_type: f.rental_fee_type ?? "",
    repair_available: f.repair_available,
    open_hours: f.open_hours ?? "",
    total_bikes: f.total_bikes,
    available_bikes: f.available_bikes,
    region_code: f.region_code ?? "",
    realtime_synced_at: f.realtime_synced_at,
  };
}

interface ApiListResponse {
  total_count: number;
  page: number;
  size: number;
  facilities?: ApiBicycleFacility[];
}

/** GET /api/bicycle-facilities — 자전거 대여소/정비소 목록 조회. */
export async function getBicycleFacilities(
  query: Record<string, string>,
): Promise<BicycleFacilityListResponse> {
  const params = new URLSearchParams(query);
  const data = await apiGet<ApiListResponse>(`/api/bicycle-facilities?${params}`);
  return {
    total_count: data.total_count,
    page: data.page,
    size: data.size,
    facilities: (data.facilities ?? []).map(fromApiFacility),
  };
}

// '가까운 순'을 브라우저에서 정렬하려고 전체 목록을 받을 때 한 번에 요청하는 개수. 백엔드 size 상한과 같다.
const ALL_FACILITIES_PAGE_SIZE = 5000;

// 전체 목록 요청에 실어 보낼 수 있는 필터. 이용자 위치(lat·lng)나 정렬이 섞여 나가지 않도록
// 지워야 할 키를 고르는 대신 보낼 키만 고른다.
// 자전거 필터를 새로 만들면(BicycleExplore의 query) 여기에도 추가한다. 빠뜨리면 '가까운 순'에서만 그 필터가 조용히 무시된다.
const ALL_FACILITIES_FILTER_KEYS = ["region", "facility_type", "fee_type", "data_source"] as const;

/**
 * 필터에 맞는 시설을 모두 받는다. '가까운 순'을 브라우저에서 정렬할 때 쓴다(map/nearestSort.ts).
 * 이용자 위치는 보내지 않는다. query에서 필터(ALL_FACILITIES_FILTER_KEYS)만 골라 서버 기본 순서(bicycle_id)로
 * 전체를 모은다.
 */
export async function getAllBicycleFacilities(query: Record<string, string>): Promise<BicycleFacility[]> {
  const filters: Record<string, string> = {};
  for (const key of ALL_FACILITIES_FILTER_KEYS) {
    if (query[key]) filters[key] = query[key];
  }

  const facilities: BicycleFacility[] = [];
  for (let page = 1; ; page++) {
    const res = await getBicycleFacilities({
      ...filters,
      page: String(page),
      size: String(ALL_FACILITIES_PAGE_SIZE),
    });
    facilities.push(...res.facilities);
    if (res.facilities.length === 0 || facilities.length >= res.total_count) return facilities;
  }
}

/** GET /api/bicycle-facilities/regions — 자전거 시설 보유 지역(시/도+시/군/구), 현재 탭 기준. */
export async function getBicycleRegions(dataSource: string): Promise<BicycleRegionOption[]> {
  return apiGet<BicycleRegionOption[]>(`/api/bicycle-facilities/regions?data_source=${dataSource}`);
}

/** GET /api/bicycle-facilities/regions/{parentCode}/subregions — 하위 구 목록(현재 탭 기준 개수 포함). */
export async function getBicycleSubregions(
  parentCode: string,
  dataSource: string,
): Promise<BicycleSubregionOption[]> {
  return apiGet<BicycleSubregionOption[]>(
    `/api/bicycle-facilities/regions/${parentCode}/subregions?data_source=${dataSource}`,
  );
}
