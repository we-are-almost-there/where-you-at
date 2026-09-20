import { authHeaders, fetchOrNetworkError, HttpError } from "../../lib/http";
import type { SigunguStampStatus } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
interface StampDto {
  sigungu_code: string;
  status: SigunguStampStatus["status"];
  stamped_at: string | null;
}
function fromDto(dto: StampDto): SigunguStampStatus {
  return { sigunguCode: dto.sigungu_code, status: dto.status, stampedAt: dto.stamped_at };
}
export async function fetchStamps(): Promise<SigunguStampStatus[]> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/me/sigungu-stamps`, { headers: authHeaders() });
  if (!res.ok) throw new HttpError(res.status, "스탬프를 불러오지 못했어요.");
  return (await res.json() as StampDto[]).map(fromDto);
}
export async function createStamp(code: string): Promise<SigunguStampStatus> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/me/sigungu-stamps/${encodeURIComponent(code)}`, {
    method: "POST", headers: authHeaders(),
  });
  if (!res.ok) throw new HttpError(res.status, "스탬프를 찍지 못했어요.");
  return fromDto(await res.json());
}
