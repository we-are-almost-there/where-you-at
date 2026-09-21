import { expect, it } from "vitest";
import { HttpError, NetworkError } from "../../lib/http";
import { toUserError } from "../../components/error/userError";
import { stampErrorMessage, stampSaveError } from "./stampErrors";
import { RecordApiError, toRecordUserError } from "./recordsErrors";

it.each(["아직 제공하지 않는 기능입니다.", "upstream unavailable"])("503 상세에 따라 내 기록과 동일한 안내를 사용한다: %s", (detail) => {
  const error = new RecordApiError(503, detail);
  expect(stampErrorMessage(error, "조회 실패")).toBe(toRecordUserError(error, "조회 실패").title);
  expect(stampSaveError("51110", error).message).toBe(toRecordUserError(error, "저장 실패").title);
});

it.each([new NetworkError(new TypeError("Failed to fetch")), new HttpError(500, "internal"), new SyntaxError("invalid JSON")])(
  "조회와 저장 오류를 공통 문구로 변환하고 원문을 노출하지 않는다: %s", (error) => {
    for (const title of ["스탬프를 불러오지 못했어요.", "스탬프를 찍지 못했어요."]) {
      const common = toUserError(error, title);
      expect(stampErrorMessage(error, title)).toBe(`${common.title}\n${common.description}`);
    }
    expect(stampSaveError("51110", error).message).toBe(stampErrorMessage(error, "스탬프를 찍지 못했어요."));
  },
);

it("409는 완주 조건 안내를 유지한다", () => {
  expect(stampSaveError("51110", new HttpError(409, "internal"))).toEqual({
    code: "51110", message: "이 지역의 완주 기록이 아직 없어요. 완주 기록을 확인한 뒤 다시 시도해 주세요.",
  });
});
