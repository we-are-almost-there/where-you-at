// 대회 API
// - USE_MOCK = true 인 동안은 raceMock 데이터 반환
// - 실제 API로 교체 시 USE_MOCK = false 로 설정하면 fetch 분기로 전환됨

import type { Race } from "./types";
import { mockRaces as raceMock } from "./raceMock";
import { fetchOrNetworkError, HttpError } from "../../lib/http";

// ??가 아니라 ||인 이유: .env에 VITE_API_BASE_URL=처럼 빈 값으로 두면 ??는 ""를
// 그대로 통과시켜 요청이 상대경로로 나가고 404가 된다. 빈 값도 폴백으로 보낸다.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const USE_MOCK = false;

interface ApiRaceListResponse {
  total: number;
  page: number;
  per_page: number;
  items: Race[];
}

export interface RaceFilters {
  region_code?: string;
  event_type?: "running" | "cycling";
  upcoming_only?: boolean;
}

export interface RacePageQuery extends RaceFilters {
  page?: number;
  per_page?: number;
}

export async function fetchRacePage(
  query: RacePageQuery = {},
  signal?: AbortSignal,
): Promise<ApiRaceListResponse> {
  signal?.throwIfAborted();
  const page = query.page ?? 1;
  const perPage = query.per_page ?? 100;
  if (USE_MOCK) {
    const items = raceMock.filter((race) =>
      (!query.region_code || race.region_code === query.region_code)
      && (!query.event_type || race.event_type === query.event_type)
      && (!query.upcoming_only || new Date(race.end_date ?? race.start_date) >= new Date())
    );
    return { total: items.length, page, per_page: perPage, items: items.slice((page - 1) * perPage, page * perPage) };
  }
  const params = new URLSearchParams();
  if (query.region_code) params.set("region_code", query.region_code);
  if (query.event_type) params.set("event_type", query.event_type);
  if (query.upcoming_only !== undefined) params.set("upcoming_only", String(query.upcoming_only));
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  const res = await fetchOrNetworkError(`${API_BASE}/api/races?${params}`, { signal });
  if (!res.ok) throw new HttpError(res.status, `대회 목록 조회 실패 (${res.status})`);
  const data: ApiRaceListResponse = await res.json();
  signal?.throwIfAborted();
  return data;
}

// 첫 응답 기준으로 페이지 수를 고정하고 최대 3개씩 요청한다.
// OFFSET 조회 중 데이터 변경으로 생기는 누락까지 보장하지는 않는다.
export async function fetchAllRaces(
  query: RaceFilters = {},
  signal?: AbortSignal,
): Promise<Race[]> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.throwIfAborted();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const first = await fetchRacePage({ ...query, page: 1 }, controller.signal);
    if (!Number.isSafeInteger(first.per_page) || first.per_page <= 0
      || !Number.isSafeInteger(first.total) || first.total < 0) {
      throw new Error("대회 페이지 정보가 올바르지 않습니다");
    }
    const pageCount = Math.ceil(first.total / first.per_page);
    const items = [...first.items];
    for (let page = 2; page <= pageCount; page += 3) {
      controller.signal.throwIfAborted();
      const pages = await Promise.all(
        Array.from({ length: Math.min(3, pageCount - page + 1) }, (_, index) =>
          fetchRacePage({ ...query, page: page + index, per_page: first.per_page }, controller.signal)
        ),
      );
      for (const result of pages) items.push(...result.items);
    }
    controller.signal.throwIfAborted();
    const unique = new Map<number, Race>();
    for (const race of items) {
      if (!unique.has(race.event_id)) unique.set(race.event_id, race);
    }
    return [...unique.values()];
  } catch (error) {
    controller.abort(); // 한 페이지가 실패하면 같은 묶음의 나머지 요청도 중단한다.
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
// TODO: 대회 상세 페이지에서 목록 API 응답이 아닌 단건 조회가 필요해지면 사용.
// 현재 상세 화면은 목록에서 선택한 Race 객체를 그대로 재사용하고 있어 아직 미사용.
export async function fetchRaceDetail(eventId: number): Promise<Race> {
  if (USE_MOCK) {
    const found = raceMock.find((r) => r.event_id === eventId);
    if (!found) throw new Error("해당 대회를 찾을 수 없습니다");
    return found;
  }

  const res = await fetchOrNetworkError(`${API_BASE}/api/races/${eventId}`);
  if (!res.ok) throw new HttpError(res.status, `대회 상세 조회 실패 (${res.status})`);
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

const ACCOMMODATION_CACHE_TTL_MS = 5 * 60 * 1000;
const accommodationCache = new Map<string, {
  data: NearbyAccommodation[];
  expiresAt: number;
}>();

// 성공한 결과(빈 목록 포함)는 대회·반경별로 5분간 메모리에 보관한다.
export async function fetchNearbyAccommodations(
  eventId: number,
  radiusKm: number = 5,
  signal?: AbortSignal
): Promise<NearbyAccommodation[]> {
  signal?.throwIfAborted();
  const cacheKey = `${eventId}:${radiusKm}`;
  const now = Date.now();
  for (const [key, entry] of accommodationCache) {
    if (entry.expiresAt <= now) accommodationCache.delete(key);
  }
  const cached = accommodationCache.get(cacheKey);
  if (cached) return cached.data;

  const res = await fetchOrNetworkError(
    `${API_BASE}/api/races/${eventId}/nearby-accommodations?radius_km=${radiusKm}`,
    { signal }
  );
  if (!res.ok) throw new HttpError(res.status, `주변 숙박 조회 실패 (${res.status})`);
  const data: NearbyAccommodation[] = await res.json();
  signal?.throwIfAborted();
  accommodationCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ACCOMMODATION_CACHE_TTL_MS,
  });
  return data;
}
