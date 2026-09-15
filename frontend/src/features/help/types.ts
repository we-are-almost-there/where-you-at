// 공지사항·FAQ·1:1 문의 API 타입. backend/app/schemas/notice.py, faq.py, inquiry.py와 맞춘다.

export interface NoticeSummary {
  id: number;
  title: string;
  is_pinned: boolean;
  /** ISO 8601 시각. 화면에는 게시일로 표시한다. */
  published_at: string;
}

export interface NoticeListResponse {
  total: number;
  page: number;
  per_page: number;
  items: NoticeSummary[];
}

export interface NoticeDetail extends NoticeSummary {
  /** 제한된 마크다운 (문단·목록·굵게·링크). markdown.ts 참고 */
  content: string;
}

export interface Faq {
  id: number;
  category: string;
  question: string;
  /** 제한된 마크다운 (문단·목록·굵게·링크). markdown.ts 참고 */
  answer: string;
}

/** 문의 유형. 바꾸면 backend/app/schemas/inquiry.py와 sql/01_schema.sql의 inquiry check도 함께 바꾼다. */
export const INQUIRY_CATEGORIES = ["코스 탐색", "대회 행사", "방문 혜택", "자전거 대여", "정보 오류 신고", "기타"] as const;
export type InquiryCategory = (typeof INQUIRY_CATEGORIES)[number];

export interface InquiryRequest {
  category: InquiryCategory;
  email: string;
  content: string;
  agreed: boolean;
  /** 스팸 방지용 숨긴 입력칸. 사람은 비워 둔다. */
  website: string;
}

export interface InquiryResponse {
  received: boolean;
}
