import type { Faq, NoticeDetail, NoticeListResponse } from "./types";

// 화면 개발용 목 데이터. VITE_HELP_MOCK=true일 때만 쓰인다 (helpApi.ts 참고).
// 운영 문구의 기준은 backend/sql/04_help_seed.sql이다. 첫 공지는 시드와 같은 문구로 두고,
// 나머지 예시 공지와 FAQ는 고정 공지·페이지 나눔·마크다운 요소를 화면에서 확인하려고 만든 것이다.

const notices: NoticeDetail[] = [
  {
    id: 1,
    title: "어디까지왔니 서비스를 시작합니다",
    is_pinned: true,
    published_at: "2026-09-14T00:00:00Z",
    // backend/sql/04_help_seed.sql의 서비스 오픈 공지와 같은 문구. 시드를 고치면 여기도 함께 고친다.
    content:
      "안녕하세요, 어디까지왔니입니다.\n\n어디까지왔니는 공공데이터포털과 카카오맵 API를 활용하여 걷기·자전거 코스를 찾아 따라가고, 인구감소지역을 여행할 때 받을 수 있는 혜택까지 함께 확인할 수 있는 서비스입니다.\n\n지금 이용할 수 있는 기능은 다음과 같습니다.\n\n- **코스 탐색**: 도보·자전거 코스를 지역, 난이도, 거리로 찾아볼 수 있습니다.\n  - **코스 따라가기**: 현재 위치를 기준으로 진행률과 남은 거리를 보여 드리고, 코스를 벗어나면 음성과 화면으로 알려 드립니다.\n  - **기록 카드**: 따라가기를 마치면 거리, 시간, 평균 페이스(자전거는 평균 속도)를 담은 이미지를 저장할 수 있습니다. SNS에 이미지를 업로드하여 뽐내보세요!\n  - **주변 정보**: 코스 상세에서 코스 경로 주변의 관광지, 음식점, 숙박, 자전거 대여소를 경로에서 가까운 순으로 보여 드리고, 지도에서 위치와 운영시간·주차 같은 상세 정보를 확인할 수 있습니다.\n- **대회 행사**: 러닝·자전거 대회 일정을 목록과 캘린더로 확인할 수 있습니다.\n- **방문 혜택**: 인구감소지역 여행 시 받을 수 있는 지원 제도를 지역별로 확인할 수 있습니다.\n  - **예상 환급액 계산**: 금액을 입력하면 제도 조건에 따라 예상 환급액을 계산해 드립니다.\n  - **신청 체크리스트**: 제도마다 신청에 필요한 항목을 확인하고 체크해 둘 수 있습니다.\n- **자전거 대여**: 지역, 대여소 유형, 요금으로 대여소를 찾을 수 있습니다.\n  - **실시간**: 실시간 정보가 있는 대여소는 대여 가능 대수를 확인할 수 있습니다.\n\n코스와 대회, 자전거 대여소 정보는 공공데이터를, 방문 혜택 정보는 문화체육관광부와 한국관광공사의 제도 안내를 바탕으로 제공합니다. 업데이트 시점에 따라 실제와 다를 수 있으니 방문이나 참가 전에 주최 기관이나 해당 지자체에 다시 확인해 주세요.",
  },
  ...Array.from({ length: 11 }, (_, i): NoticeDetail => ({
    id: i + 2,
    title: `(예시) 페이지 나눔 확인용 공지 ${i + 1}`,
    is_pinned: false,
    published_at: new Date(Date.UTC(2026, 8, 13 - i, 3)).toISOString(),
    content:
      "목록의 페이지 나눔을 확인하기 위한 예시 공지입니다.\n\n외부 링크는 새 탭으로 열립니다: [공공데이터포털](https://www.data.go.kr)",
  })),
];

/** 서버와 같은 순서(고정 → 최근 게시순)로 정렬해 한 페이지를 잘라 준다. */
export function mockNoticeList(page: number, perPage: number): NoticeListResponse {
  const sorted = [...notices].sort(
    (a, b) =>
      Number(b.is_pinned) - Number(a.is_pinned) ||
      b.published_at.localeCompare(a.published_at) ||
      b.id - a.id,
  );
  const start = (page - 1) * perPage;
  return {
    total: sorted.length,
    page,
    per_page: perPage,
    items: sorted
      .slice(start, start + perPage)
      .map(({ id, title, is_pinned, published_at }) => ({ id, title, is_pinned, published_at })),
  };
}

export function mockNoticeDetail(id: number): NoticeDetail | null {
  return notices.find((notice) => notice.id === id) ?? null;
}

export const mockFaqs: Faq[] = [
  {
    id: 1,
    category: "코스 탐색",
    question: "위치 권한을 허용하지 않아도 이용할 수 있나요?",
    answer:
      "네. 홈의 가까운 코스는 기본 코스 목록으로, 코스 탐색의 ‘가까운 순’ 정렬과 자전거 대여소 목록은 기본 순서로 보여 드립니다.\n\n다만 **코스 따라가기는 현재 위치가 꼭 필요해서** 위치 권한을 허용해야 사용할 수 있습니다.",
  },
  {
    id: 2,
    category: "코스 탐색",
    question: "코스 정보는 어디에서 가져오나요?",
    answer:
      "걷기여행길 코스는 한국관광공사 두루누비, 자전거길 노선은 행정안전부 자전거길 데이터를 이용합니다.",
  },
  {
    id: 3,
    category: "코스 따라가기",
    question: "따라가기가 시작되지 않아요.",
    answer:
      "다음 경우에는 따라가기를 시작할 수 없습니다.\n\n- **현재 위치가 코스에서 너무 먼 경우**: 코스 근처로 이동한 뒤 다시 시작해 주세요.\n- **위치 권한을 거부한 경우**: 브라우저 설정에서 이 사이트의 위치 권한을 허용해 주세요.",
  },
  {
    id: 4,
    category: "이용 안내",
    question: "회원가입이 필요한가요?",
    answer: "아니요. 회원가입이나 로그인 없이 모든 기능을 이용할 수 있습니다.",
  },
  {
    id: 5,
    category: "이용 안내",
    question: "공지사항은 어디에서 볼 수 있나요?",
    answer: "[공지사항](/notices)에서 확인할 수 있습니다.",
  },
];
