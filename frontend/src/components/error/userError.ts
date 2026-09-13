// 여러 화면이 함께 쓰는 에러 문구.
//
// err.message를 그대로 화면에 띄우면 fetch가 응답 자체를 못 받았을 때
// "Failed to fetch" 같은 영어 원문이 사용자에게 노출된다.
// 던져진 값이 무엇이든 여기서 한 번 걸러 사용자용 제목·설명으로 바꾼다.
//
// API 레이어는 사용자 문구를 만들지 않는다. 연결 실패는 fetch의 TypeError를 그대로 두고,
// HTTP 실패는 HttpError로 던진다. 사용자 문구로 바꾸는 일은 컴포넌트가 toUserError로 한다.

// 연결 실패 시 표준 문구 (여러 화면에서 동일하게 사용)
export const CONNECTION_ERROR_TITLE = "서버에 연결할 수 없어요";
export const CONNECTION_ERROR_DESC =
  "일시적인 통신 문제로 정보를 불러오지 못했습니다.\n잠시 후 다시 시도해 주세요.";

export type UserError = {
  title: string;
  description: string;
};

const RETRY_DESC = "잠시 후 다시 시도해 주세요.";

/**
 * 서버가 응답은 했지만 ok가 아닐 때(4xx/5xx) API 레이어가 던진다.
 * 화면이 404처럼 상태별로 다르게 그려야 할 때 status로 구분한다.
 */
export class HttpError extends Error {
  // erasableSyntaxOnly가 켜져 있어 생성자 매개변수 프로퍼티 대신 필드를 따로 선언한다.
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * 에러 객체 → 사용자용 문구.
 *
 * fetch는 서버까지 못 갔을 때(오프라인·DNS 실패 등)만 TypeError를 던진다.
 * 그 외(4xx/5xx)는 API 레이어가 직접 만든 Error라 상태 코드가 붙어 있는데,
 * 이것도 사용자에게 보여줄 문장은 아니라 fallbackTitle로 덮는다.
 *
 * 한계: 이번 범위에서는 기존 TypeError 계약을 유지한다. 응답을 변환하다 난 TypeError도
 * 연결 실패로 분류된다. 따로 가려야 하면 연결 실패 전용 에러 타입으로 바꾼다.
 */
export function toUserError(err: unknown, fallbackTitle: string): UserError {
  if (err instanceof TypeError) {
    return { title: CONNECTION_ERROR_TITLE, description: CONNECTION_ERROR_DESC };
  }
  return { title: fallbackTitle, description: RETRY_DESC };
}
