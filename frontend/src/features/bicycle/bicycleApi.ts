import type { BicycleFacility, BicycleFacilityListResponse } from "./types";
import { HttpError } from "../../components/error/userError";
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
 * 네트워크 실패는 fetch의 TypeError를 그대로 두고, HTTP 오류는 HttpError로 던진다.
 */
async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
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
