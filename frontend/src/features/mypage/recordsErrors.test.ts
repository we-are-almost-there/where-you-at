import { expect, it } from "vitest";
import { canRetryCardUpload, isRecordRequestRejected, RecordApiError, toRecordUserError } from "./recordsErrors";

it.each([
  [409, "저장할 수 있는 기록 카드 수를 넘었어요.", "기록 카드 수", false],
  [409, "업로드한 이미지가 바뀌었습니다. 다시 시도해 주세요.", "이미지가 바뀌었어요", true],
  [429, "요청이 너무 잦아요.", "잠시 후", true],
  [503, "아직 제공하지 않는 기능입니다.", "아직 제공하지 않는 기능", false],
  [503, "데이터베이스에 연결할 수 없습니다.", "기록 서버", true],
  [422, [{ loc: ["body", "finished_at"] }], "기기 시각", false],
] as const)("상태 %s와 detail에 맞는 안내와 재시도 여부를 반환한다", (status, detail, message, retry) => {
  const error = new RecordApiError(status, detail);
  expect(toRecordUserError(error, "실패").title).toContain(message);
  expect(canRetryCardUpload(error)).toBe(retry);
});

it("응답 본문을 알 수 없는 오류나 일반 5xx를 명확한 거절로 취급하지 않는다", () => {
  expect(isRecordRequestRejected(new RecordApiError(503, "데이터베이스에 연결할 수 없습니다."))).toBe(false);
  expect(isRecordRequestRejected(new RecordApiError(500, "내부 오류"))).toBe(false);
  expect(isRecordRequestRejected(new RecordApiError(409, undefined))).toBe(false);
});
