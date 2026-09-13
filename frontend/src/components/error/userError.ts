// 여러 화면이 함께 쓰는 에러 문구.
//
// err.message를 그대로 화면에 띄우면 fetch가 응답 자체를 못 받았을 때
// "Failed to fetch" 같은 영어 원문이 사용자에게 노출된다.
// 던져진 값이 무엇이든 여기서 한 번 걸러 사용자용 제목·설명으로 바꾼다.
//
// API 레이어는 사용자 문구를 만들지 않는다. 연결 실패는 NetworkError로, HTTP 실패는 HttpError로
// 던진다(lib/http). 사용자 문구로 바꾸는 일은 컴포넌트가 toUserError로 한다.

import { NetworkError } from "../../lib/http";

// 연결 실패 시 표준 문구 (여러 화면에서 동일하게 사용)
const CONNECTION_ERROR_TITLE = "서버에 연결할 수 없어요";
const CONNECTION_ERROR_DESC =
  "일시적인 통신 문제로 정보를 불러오지 못했습니다.\n잠시 후 다시 시도해 주세요.";

export type UserError = {
  title: string;
  description: string;
};

const RETRY_DESC = "잠시 후 다시 시도해 주세요.";

/**
 * 에러 객체 → 사용자용 문구.
 *
 * 연결 실패(NetworkError)만 표준 연결 실패 문구로 바꾼다.
 * 그 외(HTTP 4xx/5xx, 응답 파싱이나 변환 중 오류 등)는 사용자에게 보여줄 문장이 아니라 fallbackTitle로 덮는다.
 * 응답을 변환하다 난 TypeError까지 연결 실패로 보이면 실제 원인이 가려지므로 TypeError로는 판별하지 않는다.
 */
export function toUserError(err: unknown, fallbackTitle: string): UserError {
  if (err instanceof NetworkError) {
    return { title: CONNECTION_ERROR_TITLE, description: CONNECTION_ERROR_DESC };
  }
  return { title: fallbackTitle, description: RETRY_DESC };
}
