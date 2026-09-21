import { authHeaders, fetchOrNetworkError } from "../../lib/http";
import { recordApiError } from "./recordsErrors";
import { readAccessToken } from "../../lib/authToken";
import { expireAuthSession } from "../auth/useAuth";
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
  const token = readAccessToken();
  const res = await fetchOrNetworkError(`${API_BASE}/api/me/sigungu-stamps`, { headers: authHeaders() });
  if (res.status === 401 && token === readAccessToken()) expireAuthSession();
  if (!res.ok) throw await recordApiError(res);
  return (await res.json() as StampDto[]).map(fromDto);
}
export async function createStamp(code: string): Promise<SigunguStampStatus> {
  const token = readAccessToken();
  const res = await fetchOrNetworkError(`${API_BASE}/api/me/sigungu-stamps/${encodeURIComponent(code)}`, {
    method: "POST", headers: authHeaders(),
  });
  if (res.status === 401 && token === readAccessToken()) expireAuthSession();
  if (!res.ok) throw await recordApiError(res);
  return fromDto(await res.json());
}
