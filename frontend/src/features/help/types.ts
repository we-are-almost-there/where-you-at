// 공지사항·FAQ API 응답 타입. backend/app/schemas/notice.py, faq.py와 맞춘다.

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
