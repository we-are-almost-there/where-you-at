// 지원금 Mock 데이터
// sql/03_support_seed.sql 로 적재되는 내용과 동일하게 유지.
// ※ 10~11주차 Mock 제거 시 *Mock.ts 파일 검색으로 일괄 삭제.

import type { SupportListItem, SupportDetail } from "./support.types";

export const SUPPORT_LIST_MOCK: SupportListItem[] = [
  {
    id: 1,
    title: "대한민국 반값여행",
    agency: "한국관광공사·참여 지자체",
    summary: "인구감소지역 여행 시 사용 금액의 50%를 지역화폐로 환급",
    support_type: "반값여행",
    refund_type: "정률",
    max_amount: 100000,
    end_date: "2026-08-31",
    badge_type: "refund",
  },
  {
    id: 2,
    title: "디지털 관광주민증",
    agency: "문화체육관광부·한국관광공사",
    summary: "52개 참여 지역에서 입장료·숙박·체험 할인을 받는 무료 모바일 패스",
    support_type: "관광주민증",
    refund_type: "할인",
    max_amount: null,
    end_date: "2026-12-31",
    badge_type: "pass",
  },
  {
    id: 3,
    title: "2026 여름맞이 숙박세일 페스타",
    agency: "문화체육관광부·한국관광공사",
    summary: "비수도권 인구감소지역 숙박 결제 시 구간별 정액 할인권 발급",
    support_type: "숙박할인",
    refund_type: "정액",
    max_amount: 70000,
    end_date: "2026-07-31",
    badge_type: "discount",
  },
];

export const SUPPORT_DETAIL_MOCK: Record<number, SupportDetail> = {
  1: {
    id: 1,
    title: "대한민국 반값여행",
    description:
      "인구감소지역을 여행하고 지정 관광지 방문과 소비 영수증을 인증하면 사용 금액의 50%를 모바일 지역사랑상품권으로 환급받는 사후 정산 제도입니다. 개인 최대 10만 원, 2인 이상 단체는 최대 20만 원까지 환급됩니다(청년 만 19~34세는 환급률 70%, 최대 14만 원). 반드시 여행 전 사전 신청·승인을 받아야 하며 여행 후 신청은 불가합니다. 카드영수증·지역화폐 결제만 인정되며, 지역·차수별로 신청 기간과 조건이 다르니 신청 페이지에서 최신 상태를 확인하세요.",
    is_pre_approval: true,
    apply_url: "https://korean.visitkorea.or.kr/dgtourcard/tour50.do",
    refund_rules: [
      {
        category: "전체",
        min_spend: 100000,
        refund_value: 50,
        is_rate: true,
        description:
          "지정 관광지 방문·소비 인증 시 사용 금액의 50%를 지역화폐로 환급 (개인 최대 10만 원)",
      },
    ],
    checklist: [
      { id: 1, content: "참여 지자체·차수별 신청 접수 기간 확인", is_essential: true, sort_order: 1 },
      { id: 2, content: "여행 전 사전 여행계획 신청 및 승인 받기 (필수)", is_essential: true, sort_order: 2 },
      { id: 3, content: "지정 유료 관광지 1개소 이상 방문 및 인증사진 촬영", is_essential: true, sort_order: 3 },
      { id: 4, content: "카드영수증·지역화폐 결제영수증 보관 (현금 제외)", is_essential: true, sort_order: 4 },
      { id: 5, content: "숙박 시 숙박이용확인서 준비", is_essential: false, sort_order: 5 },
      { id: 6, content: "여행 후 정해진 기간 내 정산 신청", is_essential: true, sort_order: 6 },
    ],
  },
  2: {
    id: 2,
    title: "디지털 관광주민증",
    description:
      "인구감소지역의 명예 주민이 되어 현지 주민 수준의 할인을 받는 모바일 전용 패스입니다. 대한민국 국민 누구나 무료로 발급받을 수 있으며, 발급 지역을 방문해 매표소·가맹점에서 QR 인증 또는 화면 제시 시 입장료·숙박·식음료·체험 할인을 현장에서 즉시 받습니다(지역별 10~50%). 인구감소지역 89곳 중 참여 52개 지역이 대상이며 연중 상시 운영됩니다. 본인 거주지 지역은 발급이 제한됩니다.",
    is_pre_approval: false,
    apply_url: "https://korean.visitkorea.or.kr/dgtourcard/",
    refund_rules: [],
    checklist: [
      { id: 7, content: "대한민국 구석구석 앱 또는 공식 홈페이지 설치", is_essential: true, sort_order: 1 },
      { id: 8, content: "간편 로그인 및 본인인증 완료", is_essential: true, sort_order: 2 },
      { id: 9, content: "방문할 인구감소지역 선택 후 주민증 발급 (거주지 제외)", is_essential: true, sort_order: 3 },
      { id: 10, content: "현장 가맹점에서 QR 인증 또는 화면 제시", is_essential: true, sort_order: 4 },
      { id: 11, content: "방문 전 가맹점·할인 시설 목록 미리 확인", is_essential: false, sort_order: 5 },
    ],
  },
  3: {
    id: 3,
    title: "2026 여름맞이 숙박세일 페스타",
    description:
      "비수도권·인구감소지역 숙박 예약 시 결제 금액 구간에 따라 정액 할인권을 즉시 발급받는 제도입니다. 1박은 결제 7만 원 미만 시 2만 원, 7만 원 이상 시 3만 원을 할인하고, 연박(2박 이상)은 14만 원 미만 시 5만 원, 14만 원 이상 시 7만 원을 할인합니다. 참여 온라인 여행사에서 선착순으로 할인권을 발급받아 예약 시 즉시 적용됩니다. 발급 후 유효기간 내 미사용 시 소멸되며, 선착순·예산 소진 시 조기 마감될 수 있습니다.",
    is_pre_approval: false,
    apply_url: "https://ktostay.visitkorea.or.kr/",
    refund_rules: [
      { category: "숙박-1박", min_spend: 20000, refund_value: 20000, is_rate: false, description: "1박 결제 7만 원 미만 시 2만 원 할인 (부가세 포함 2만 원 이상 결제)" },
      { category: "숙박-1박", min_spend: 70000, refund_value: 30000, is_rate: false, description: "1박 결제 7만 원 이상 시 3만 원 할인" },
      { category: "숙박-연박", min_spend: 50000, refund_value: 50000, is_rate: false, description: "연박(2박 이상) 결제 14만 원 미만 시 5만 원 할인 (부가세 포함 5만 원 이상 결제)" },
      { category: "숙박-연박", min_spend: 140000, refund_value: 70000, is_rate: false, description: "연박(2박 이상) 결제 14만 원 이상 시 7만 원 할인" },
    ],
    checklist: [
      { id: 12, content: "참여 온라인 여행사 확인", is_essential: true, sort_order: 1 },
      { id: 13, content: "할인권 발급 (선착순, 1인 1매)", is_essential: true, sort_order: 2 },
      { id: 14, content: "유효기간 내 비수도권 숙박 예약 완료", is_essential: true, sort_order: 3 },
      { id: 15, content: "결제 금액 구간 확인 (1박/연박 기준)", is_essential: false, sort_order: 4 },
    ],
  },
};