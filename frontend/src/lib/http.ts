// API 레이어가 함께 쓰는 전송 계층 코드. 사용자 문구는 만들지 않는다.

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
