// 이용약관·개인정보처리방침에 함께 들어가는 운영 정보. 한 곳에서 바꾸면 두 문서가 같이 바뀐다.

/** 운영 주체. 푸터의 저작권 표시와 같다. */
export const OPERATOR = "거의 다왔어 팀";
export const SERVICE = "어디까지왔니";
export const CONTEST = "2026 관광데이터 활용 공모전";

/**
 * 두 문서의 현재 시행일. 배포하는 날과 같아야 한다(공지사항의 변경 안내와도 같게 둔다).
 * 내용을 바꾸면 지금 버전을 versions/에 복사해 PREVIOUS_VERSIONS에 추가하고, 새 시행일을 적는다.
 */
export const EFFECTIVE_DATE = "2026년 9월 19일";

export interface PreviousVersion {
  /** 적용 기간. 예: "2026년 9월 17일 ~ 2026년 9월 18일" */
  period: string;
  privacyPath: string;
  termsPath: string;
}

/** 이전 버전. 최근 것이 앞. 방침 14번과 약관 부칙에서 링크한다. */
export const PREVIOUS_VERSIONS: readonly PreviousVersion[] = [
  { period: "2026년 9월 17일 ~ 2026년 9월 18일", privacyPath: "/privacy/2026-09-17", termsPath: "/terms/2026-09-17" },
];
