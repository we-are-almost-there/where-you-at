// 지원금 탭의 에러 문구.
//
// err.message를 그대로 화면에 띄우면 fetch가 응답 자체를 못 받았을 때
// "Failed to fetch" 같은 영어 원문이 사용자에게 노출된다.
// 던져진 값이 무엇이든 여기서 한 번 걸러 사용자용 제목·설명으로 바꾼다.
//
// 문구는 코스 탐색이 쓰는 ErrorNotice의 상수를 그대로 가져다 쓴다.
// (세 탭의 에러 UI를 하나로 묶을지는 별도 논의 예정이라, 지금은 컴포넌트가 아니라
//  문구만 공유한다.)
import { CONNECTION_ERROR_TITLE, CONNECTION_ERROR_DESC } from "../map/components/ErrorNotice";

export type UserError = {
  title: string;
  description: string;
};

const RETRY_DESC = "잠시 후 다시 시도해 주세요.";

/**
 * 에러 객체 → 사용자용 문구.
 *
 * fetch는 서버까지 못 갔을 때(오프라인·DNS 실패 등)만 TypeError를 던진다.
 * 그 외(4xx/5xx)는 supportApi가 직접 만든 Error라 상태 코드가 붙어 있는데,
 * 이것도 사용자에게 보여줄 문장은 아니라 fallbackTitle로 덮는다.
 */
export function toUserError(err: unknown, fallbackTitle: string): UserError {
  if (err instanceof TypeError) {
    return { title: CONNECTION_ERROR_TITLE, description: CONNECTION_ERROR_DESC };
  }
  return { title: fallbackTitle, description: RETRY_DESC };
}
