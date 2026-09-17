// API 레이어가 함께 쓰는 전송 계층 코드. 사용자 문구는 만들지 않는다.

import { readAccessToken } from "./authToken";

/** 로그인했으면 Authorization 헤더를, 아니면 빈 객체를 돌려준다. 로그인이 필요한 API 요청에 펼쳐 넣는다. */
export function authHeaders(): Record<string, string> {
  const token = readAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * 서버가 응답은 했지만 ok가 아닐 때(4xx/5xx) API 레이어가 던진다.
 * 화면이 404처럼 상태별로 다르게 그려야 할 때 status로 구분한다.
 */
export class HttpError extends Error {
  // erasableSyntaxOnly가 켜져 있어 생성자 매개변수 프로퍼티 대신 필드를 따로 선언한다.
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * fetch가 서버에 닿지 못했을 때(오프라인, DNS 실패, 서버 다운 등) API 레이어가 던진다.
 * 원래 오류는 cause로 남겨 원인을 추적할 수 있게 한다.
 */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("서버에 연결하지 못했어요", { cause });
    this.name = "NetworkError";
  }
}

/**
 * fetch 호출 자체가 실패한 경우만 NetworkError로 바꾼다.
 *
 * fetch는 연결 실패를 TypeError로 알린다. 응답을 받은 뒤의 res.json()과 변환은 이 함수 밖에서
 * 돌기 때문에, 거기서 난 TypeError는 연결 실패로 섞이지 않는다.
 * 요청 취소(AbortError)처럼 TypeError가 아닌 오류는 호출부가 원래대로 구분하도록 그대로 던진다.
 */
export async function fetchOrNetworkError(...args: Parameters<typeof fetch>): Promise<Response> {
  try {
    return await fetch(...args);
  } catch (error) {
    if (error instanceof TypeError) throw new NetworkError(error);
    throw error;
  }
}
