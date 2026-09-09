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

export const BADGE_LABEL: Record<BadgeType, string> = {
  refund: "환급",
  discount: "할인",
  pass: "무료 패스",
};

// 코스 카드의 관광지 칩(bg-lavender/text-accent)과 같은 계열로 맞춘 뱃지 스타일
export const BADGE_CLASS: Record<BadgeType, string> = {
  refund: "bg-accent text-white",
  pass: "bg-ink text-white",
  discount: "bg-lavender text-accent",
};

export interface SupportListQuery {
  region_code?: string;
  target?: string;
}

// 환급 계산 요청/응답
export type CalculateRequest = {
  region_code: string;
  spent_by_category: Record<string, number>; // 키는 한글 ("숙박" 등)
  stay_duration: number;
};

export type CalculationBasisItem = {
  item: string;        // 제도명 (support_title)
  amount: number;      // 이 항목 환급액
  description: string; // 규칙 설명 (없으면 "")
};

export type CalculateResponse = {
  expected_refund: number;
  calculation_basis: CalculationBasisItem[];
  tips: string[];
};