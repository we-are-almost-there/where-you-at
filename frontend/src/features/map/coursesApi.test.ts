// coursesApi의 에러 경계 테스트 (vitest, fetch mock).
//
// 테스트 범위: apiGet이 사용자 문구로 바꾸지 않고 에러 종류를 보존하는지에 한정한다.
//   - 404면 status가 담긴 HttpError (코스 상세가 "코스를 찾을 수 없어요"를 고르는 근거)
//   - fetch가 TypeError로 실패하면 그대로 TypeError (toUserError가 연결 실패로 판별하는 근거)

import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../lib/http";
import { getCourseDetail } from "./coursesApi";

describe("getCourseDetail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("존재하지 않는 코스면 status 404인 HttpError를 throw한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );

    const err = await getCourseDetail(999999).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
  });

  it("fetch가 TypeError로 실패하면 TypeError를 그대로 throw한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(getCourseDetail(1)).rejects.toBeInstanceOf(TypeError);
  });
});
