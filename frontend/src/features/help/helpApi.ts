// 공지사항·FAQ API
// - HTTP 오류는 HttpError로 던지고, 연결 실패는 fetch의 TypeError를 그대로 둔다.
//   화면 문구 변환은 컴포넌트가 toUserError로 한다.
// - VITE_HELP_MOCK=true면 helpMock 데이터를 돌려준다. 시드를 운영 DB에 넣기 전(문구 검토 중)에도
//   화면을 개발할 수 있게 두었다. 다른 API처럼 코드의 USE_MOCK 상수로 두면 true인 채로 커밋될 수
//   있어서, 커밋되지 않는 frontend/.env.development.local에서 켜도록 했다.

import { HttpError } from "../../components/error/userError";
import type { Faq, NoticeDetail, NoticeListResponse } from "./types";
import { mockFaqs, mockNoticeDetail, mockNoticeList } from "./helpMock";

// ??가 아니라 ||인 이유는 raceApi.ts 참고 (빈 값도 폴백으로 보낸다).
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const USE_MOCK = import.meta.env.VITE_HELP_MOCK === "true";

export interface NoticeListQuery {
  page?: number;
  perPage?: number;
}

export async function fetchNotices(query: NoticeListQuery = {}): Promise<NoticeListResponse> {
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 10;
  if (USE_MOCK) return mockNoticeList(page, perPage);

  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  const res = await fetch(`${API_BASE}/api/notices?${params}`);
  if (!res.ok) throw new HttpError(res.status, `공지사항 목록 조회 실패 (${res.status})`);
  return res.json();
}

export async function fetchNotice(id: number): Promise<NoticeDetail> {
  if (USE_MOCK) {
    const found = mockNoticeDetail(id);
    if (!found) throw new HttpError(404, "공지사항 상세 조회 실패 (404)");
    return found;
  }

  const res = await fetch(`${API_BASE}/api/notices/${id}`);
  if (!res.ok) throw new HttpError(res.status, `공지사항 상세 조회 실패 (${res.status})`);
  return res.json();
}

export async function fetchFaqs(): Promise<Faq[]> {
  if (USE_MOCK) return mockFaqs;

  const res = await fetch(`${API_BASE}/api/faqs`);
  if (!res.ok) throw new HttpError(res.status, `자주 묻는 질문 조회 실패 (${res.status})`);
  return res.json();
}
