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
 * 활성 지역 조회 제한 시간. 넘으면 실패로 보고 폴백 색칠로 넘어간다.
 * 테스트가 이 값만큼 타이머를 감아야 하므로 내보낸다 — 숫자를 양쪽에 따로 적으면
 * 여기서 시간을 늘렸을 때 테스트는 만료 전에 끝나 아무것도 검증하지 못한다.
 */
export const ACTIVE_REGIONS_TIMEOUT_MS = 8000;

/**
 * 지금 신청 가능한 제도가 있는 지역 코드.
 * 지도 색칠 판정을 정적 파일이 아니라 이 목록으로 하면, 제도 기간이 끝나거나
 * 차수 상태가 바뀔 때 배포 없이 회색으로 반영된다.
 *
 * 이 응답이 오기 전까지 지도는 아무 지역도 활성으로 두지 않는다. 서버가 응답도
 * 실패도 하지 않고 붙잡고 있으면 "확인 중"에서 못 벗어나므로 제한 시간을 둔다.
 * signal로 화면을 떠날 때 요청을 함께 취소할 수 있다.
 */
export async function fetchActiveRegionCodes(signal?: AbortSignal): Promise<string[]> {
  // AbortSignal.timeout / AbortSignal.any는 Safari 17.4에서야 들어왔다. Vite 기본
  // 빌드 대상에는 Safari 16이 포함되므로, 그 브라우저에서는 fetch를 걸어보기도 전에
  // TypeError가 나서 첫 조회가 무조건 실패한다. 어디서나 되는 조합으로 직접 엮는다.
  const controller = new AbortController();
  const abort = () => controller.abort();

  if (signal?.aborted) abort(); // 이미 취소된 신호는 리스너가 울리지 않는다
  signal?.addEventListener("abort", abort);
  const timer = setTimeout(abort, ACTIVE_REGIONS_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/api/support/regions`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`활성 지역 조회 실패 (${res.status})`);
    // 본문을 다 읽기 전에 타이머를 풀면 느린 응답 중간에 멈춰 선다
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
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