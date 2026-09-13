import { describe, expect, it } from "vitest";
import { HttpError, NetworkError } from "../../lib/http";
import { toUserError } from "./userError";

describe("toUserError", () => {
  it("NetworkError는 연결 실패 문구로 바꾼다", () => {
    const network = toUserError(new NetworkError(new TypeError("Failed to fetch")), "코스를 불러오지 못했어요");

    expect(network.title).toBe("서버에 연결할 수 없어요");
  });

  it("HttpError는 상태 코드 없이 화면별 제목으로 바꾼다", () => {
    const err = new HttpError(500, "불러오지 못했어요 (500)");
    const result = toUserError(err, "코스를 불러오지 못했어요");

    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(500);
    expect(result).toEqual({ title: "코스를 불러오지 못했어요", description: "잠시 후 다시 시도해 주세요." });
  });

  it("Error가 아닌 값도 화면별 제목으로 바꾼다", () => {
    expect(toUserError("boom", "대회 목록을 불러오지 못했어요")).toEqual({
      title: "대회 목록을 불러오지 못했어요",
      description: "잠시 후 다시 시도해 주세요.",
    });
  });
});
