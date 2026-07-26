// 지원금 도메인 타입
// 백엔드 응답(support / refund_rule / checklist_item)과 형태를 맞춤.
// DB 컬럼 support_title 은 응답에서 title 로 매핑됨.

export interface SupportListItem {
  id: number;
  title: string;
  agency: string | null;
  summary: string | null;
  support_type: string; // 반값여행 / 관광주민증 / 숙박할인
  refund_type: string; // 할인 / 정액 / 정률
  max_amount: number | null;
  end_date: string | null;
  badge_type: BadgeType; // 프론트 표시용
}

export interface SupportDetail {
  id: number;
  title: string;
  description: string | null;
  is_pre_approval: boolean;
  apply_url: string | null;
  refund_rules: RefundRule[]; // 환급 규칙 (할인형은 빈 배열)
  checklist: ChecklistItem[];
}

export interface RefundRule {
  category: string; // 숙박-1박 / 숙박-연박 / 전체 등
  min_spend: number | null;
  refund_value: number; // is_rate=true면 %, false면 정액(원)
  is_rate: boolean;
  description: string | null;
}

export interface ChecklistItem {
  id: number;
  content: string;
  is_essential: boolean;
  sort_order: number;
}

export type BadgeType = "refund" | "discount" | "pass";

export interface SupportListQuery {
  region_code?: string;
  target?: string;
}