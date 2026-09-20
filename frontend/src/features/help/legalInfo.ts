// 이용약관·개인정보처리방침에 함께 들어가는 운영 정보. 한 곳에서 바꾸면 두 문서가 같이 바뀐다.

/** 운영 주체. 푸터의 저작권 표시와 같다. */
export const OPERATOR = "거의 다왔어 팀";
export const SERVICE = "어디까지왔니";
export const CONTEST = "2026 관광데이터 활용 공모전";

/**
 * 두 문서의 현재 시행일. 배포하는 날과 같아야 한다.
 * 시행일을 바꾸면 세 곳을 함께 고친다. 하나라도 빠지면 legalInfo.test.ts가 실패한다.
 * - 이 값
 * - PREVIOUS_VERSIONS에서 직전 버전의 기간 끝 날짜(이 값의 하루 전)
 * - backend/sql/04_help_seed.sql 변경 안내 공지 본문의 시행일
 * 내용을 바꾸면 지금 버전을 versions/에 복사해 PREVIOUS_VERSIONS에 추가하고, 새 시행일을 적는다.
 */
export const EFFECTIVE_DATE = "2026년 9월 20일";

export interface PreviousVersion {
  /** 적용 기간. 예: "2026년 9월 17일 ~ 2026년 9월 19일" */
  period: string;
  privacyPath: string;
  termsPath: string;
}

/** 이전 버전. 최근 것이 앞. 방침 14번과 약관 부칙에서 링크한다. */
export const PREVIOUS_VERSIONS: readonly PreviousVersion[] = [
  { period: "2026년 9월 17일 ~ 2026년 9월 19일", privacyPath: "/privacy/2026-09-17", termsPath: "/terms/2026-09-17" },
];

/**
 * 방침·약관 경로로 이전 버전을 찾는다. 보관본 페이지가 맨 위 안내의 적용 기간을 여기서 가져간다.
 * 기간 글자를 페이지에 따로 적어 두면 한쪽만 고쳐 방침·약관의 링크와 보관본 안내가 다른 기간을 가리키게 된다.
 * 목록에 없으면 기간이 빈 채로 그려지지 않게 던진다(versions.test.tsx가 두 보관본을 그려 확인한다).
 */
export function findPreviousVersion(path: string): PreviousVersion {
  const version = PREVIOUS_VERSIONS.find((item) => item.privacyPath === path || item.termsPath === path);
  if (!version) throw new Error(`PREVIOUS_VERSIONS에 없는 이전 버전 경로입니다: ${path}`);
  return version;
}
