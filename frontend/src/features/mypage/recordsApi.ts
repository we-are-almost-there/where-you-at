// 완주 기록·기록 카드 API
// - authApi.ts와 같이 사용자 문구로 바꾸지 않고 HttpError만 던진다.
// - 서버는 snake_case, route_type은 "trail"/"bicycle"로 주므로 여기서 화면용 타입(RunRecord, SavedRecordCard)으로 바꾼다.

import { authHeaders, fetchOrNetworkError, HttpError } from "../../lib/http";
import type { RouteType } from "../map/types";
import type { RunRecord, SavedRecordCard } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

type ServerRouteType = "trail" | "bicycle";

// 화면은 "도보"/"자전거", 서버(DB)는 "trail"/"bicycle"이다.
function toServerRouteType(type: RouteType): ServerRouteType {
  return type === "자전거" ? "bicycle" : "trail";
}

function toRouteType(type: ServerRouteType): RouteType {
  return type === "bicycle" ? "자전거" : "도보";
}

interface RunRecordDto {
  id: number;
  course_id: number;
  course_name: string;
  route_type: ServerRouteType;
  distance_km: number;
  duration_ms: number;
  pace_sec_per_km: number | null;
  finished_at: string;
}

interface RecordCardDto {
  id: number;
  record: RunRecordDto;
  image_url: string | null;
  created_at: string;
}

function toRunRecord(dto: RunRecordDto): RunRecord {
  return {
    id: dto.id,
    courseId: dto.course_id,
    courseName: dto.course_name,
    routeType: toRouteType(dto.route_type),
    distanceKm: dto.distance_km,
    durationMs: dto.duration_ms,
    paceSecPerKm: dto.pace_sec_per_km,
    finishedAt: dto.finished_at,
  };
}

function toSavedRecordCard(dto: RecordCardDto): SavedRecordCard {
  return {
    id: dto.id,
    record: toRunRecord(dto.record),
    imageUrl: dto.image_url,
    createdAt: dto.created_at,
  };
}

/** 완주 기록 저장 요청. TrackingRecord에서 뽑아 넘긴다. */
export interface CreateRecordInput {
  courseId: number;
  routeType: RouteType;
  distanceKm: number;
  durationMs: number;
  paceSecPerKm: number | null;
  /** ISO 문자열 */
  finishedAt: string;
}

export async function createRecord(input: CreateRecordInput): Promise<RunRecord> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/records`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      course_id: input.courseId,
      route_type: toServerRouteType(input.routeType),
      distance_km: input.distanceKm,
      duration_ms: input.durationMs,
      pace_sec_per_km: input.paceSecPerKm,
      finished_at: input.finishedAt,
    }),
  });
  if (!res.ok) throw new HttpError(res.status, `기록 저장 실패 (${res.status})`);
  return toRunRecord(await res.json());
}

export async function fetchRecords(): Promise<RunRecord[]> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/records`, { headers: authHeaders() });
  if (!res.ok) throw new HttpError(res.status, `기록 조회 실패 (${res.status})`);
  const data: { records: RunRecordDto[] } = await res.json();
  return data.records.map(toRunRecord);
}

export async function fetchRecordCards(): Promise<SavedRecordCard[]> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/record-cards`, { headers: authHeaders() });
  if (!res.ok) throw new HttpError(res.status, `기록 카드 조회 실패 (${res.status})`);
  const data: { cards: RecordCardDto[] } = await res.json();
  return data.cards.map(toSavedRecordCard);
}

/**
 * 카드 이미지를 R2에 올리고 기록 카드로 저장한다.
 * 1) 임시 업로드 URL 발급 → 2) 그 URL로 R2에 바로 PUT → 3) 서버가 검증·저장
 */
export async function saveRecordCard(recordId: number, image: Blob): Promise<SavedRecordCard> {
  const contentType = image.type; // Canvas toBlob("image/png")면 "image/png"

  const urlRes = await fetchOrNetworkError(`${API_BASE}/api/record-cards/upload-url`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: contentType }),
  });
  if (!urlRes.ok) throw new HttpError(urlRes.status, `업로드 URL 발급 실패 (${urlRes.status})`);
  const { upload_key, upload_url }: { upload_key: string; upload_url: string } = await urlRes.json();

  // 서명에 Content-Type이 들어 있어 같은 헤더를 보내야 한다. 우리 서버가 아니라 R2로 가므로 authHeaders는 붙이지 않는다.
  const putRes = await fetchOrNetworkError(upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: image,
  });
  if (!putRes.ok) throw new HttpError(putRes.status, `이미지 업로드 실패 (${putRes.status})`);

  const saveRes = await fetchOrNetworkError(`${API_BASE}/api/record-cards`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ record_id: recordId, upload_key }),
  });
  if (!saveRes.ok) throw new HttpError(saveRes.status, `기록 카드 저장 실패 (${saveRes.status})`);
  return toSavedRecordCard(await saveRes.json());
}
