// 완주 기록·기록 카드 API
// - HTTP 오류와 재전송하면 안 되는 최종 저장 오류를 구분한다.
// - 서버는 snake_case, route_type은 "trail"/"bicycle"로 주므로 여기서 화면용 타입(RunRecord, SavedRecordCard)으로 바꾼다.

import { authHeaders, fetchOrNetworkError } from "../../lib/http";
import { readAccessToken } from "../../lib/authToken";
import type { RouteType } from "../map/types";
import type { RecordCardPage, RunRecord, SavedRecordCard } from "./types";
import { isRecordRequestRejected, recordApiError, RecordImageValidationError } from "./recordsErrors";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/** 비멱등 POST의 결과가 불명확하면 같은 작업을 다시 전송하지 않는다. */
export class ServerSaveUnconfirmedError extends Error {}

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
  if (!res.ok) throw await recordApiError(res);
  return toRunRecord(await res.json());
}

export async function fetchRecords(): Promise<RunRecord[]> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/records`, { headers: authHeaders() });
  if (!res.ok) throw await recordApiError(res);
  const data: { records: RunRecordDto[] } = await res.json();
  return data.records.map(toRunRecord);
}

export async function fetchRecordCards(page = 1, size = 12): Promise<RecordCardPage> {
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  const res = await fetchOrNetworkError(`${API_BASE}/api/record-cards?${query}`, { headers: authHeaders() });
  if (!res.ok) throw await recordApiError(res);
  const data: { total_count: number; page: number; size: number; cards: RecordCardDto[] } = await res.json();
  return { totalCount: data.total_count, page: data.page, size: data.size, cards: data.cards.map(toSavedRecordCard) };
}

/**
 * 이미지 바이너리를 API 서버에 보내 검증·저장한다.
 * 비멱등 요청이므로 응답이 불명확하면 재전송하지 않는다.
 */
export async function saveRecordCard(recordId: number, image: Blob): Promise<SavedRecordCard> {
  if (image.size === 0 || image.size > 5 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(image.type)) {
    throw new RecordImageValidationError("카드 이미지는 PNG, JPEG, WebP 형식의 5MB 이하 파일이어야 해요. 사진이나 카드 비율을 변경해 주세요.");
  }
  const token = readAccessToken();
  const headers = { ...authHeaders(), "Content-Type": image.type };
  const checkSession = () => {
    if (readAccessToken() !== token) throw new ServerSaveUnconfirmedError("로그인 정보가 바뀌어 카드 저장을 중단했어요.");
  };
  checkSession();
  try {
    const saveRes = await fetchOrNetworkError(`${API_BASE}/api/record-cards?record_id=${recordId}`, {
      method: "POST", headers,
      body: image,
    });
    checkSession();
    if (!saveRes.ok) throw await recordApiError(saveRes);
    const saved = toSavedRecordCard(await saveRes.json());
    checkSession();
    return saved;
  } catch (cause) {
    if (isRecordRequestRejected(cause)) throw cause;
    // 서버가 INSERT 후 응답 생성에 실패했을 수도 있다. 재전송하면 중복 카드가 된다.
    throw new ServerSaveUnconfirmedError("카드 저장 여부를 확인하지 못했어요. 중복 방지를 위해 다시 전송하지 않아요. 내 기록을 확인해 주세요.", { cause });
  }
}
