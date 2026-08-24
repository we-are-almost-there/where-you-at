// 지원금 API
// - USE_MOCK = true 인 동안은 supportMock 데이터 반환
// - 실제 API로 교체 시 USE_MOCK = false 로 설정하면 fetch 분기로 전환됨

import type { SupportListItem, SupportDetail, SupportListQuery, CalculateRequest, CalculateResponse, } from "./support.types";
import { SUPPORT_LIST_MOCK, SUPPORT_DETAIL_MOCK } from "./supportMock";

// ??가 아니라 ||인 이유: .env에 VITE_API_BASE_URL=처럼 빈 값으로 두면 ??는 ""를
// 그대로 통과시켜 요청이 상대경로로 나가고 404가 된다. 빈 값도 폴백으로 보낸다.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const USE_MOCK = false;

export async function fetchSupportList(
  query: SupportListQuery = {},
): Promise<SupportListItem[]> {
  if (USE_MOCK) return SUPPORT_LIST_MOCK;

  const params = new URLSearchParams();
  if (query.region_code) params.set("region_code", query.region_code);
  if (query.target) params.set("target", query.target);

  const res = await fetch(`${API_BASE}/api/support?${params}`);
  if (!res.ok) throw new Error(`지원금 목록 조회 실패 (${res.status})`);
  return res.json();
}

export async function fetchSupportDetail(id: number): Promise<SupportDetail> {
  if (USE_MOCK) {
    const detail = SUPPORT_DETAIL_MOCK[id];
    if (!detail) throw new Error("해당 지원 제도를 찾을 수 없습니다");
    return detail;
  }

  const res = await fetch(`${API_BASE}/api/support/${id}`);
  if (!res.ok) throw new Error(`지원금 상세 조회 실패 (${res.status})`);
  return res.json();
}

/**
 * 지금 신청 가능한 제도가 있는 지역 코드.
 * 지도 색칠 판정을 정적 파일이 아니라 이 목록으로 하면, 제도 기간이 끝나거나
 * 차수 상태가 바뀔 때 배포 없이 회색으로 반영된다.
 */
export async function fetchActiveRegionCodes(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/support/regions`);
  if (!res.ok) throw new Error(`활성 지역 조회 실패 (${res.status})`);
  return res.json();
}

export async function calculateRefund(
  body: CalculateRequest,
): Promise<CalculateResponse> {
  const res = await fetch(`${API_BASE}/api/support/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`환급 계산 실패 (${res.status})`);
  return res.json();
}