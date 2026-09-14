// @vitest-environment jsdom
//
// 제도 상세의 오류 문구. 없는 제도(404)는 다시 시도해도 같은 결과라
// 재시도 안내 대신 목록에서 다시 고르라고 안내해야 한다.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupportDetail } from "./SupportDetail";
import { fetchSupportDetail } from "../supportApi";
import { HttpError } from "../../../lib/http";

vi.mock("../supportApi", () => ({ fetchSupportDetail: vi.fn() }));

const mockedDetail = vi.mocked(fetchSupportDetail);

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const renderDetail = (id: number) =>
  render(
    <MemoryRouter>
      <SupportDetail id={id} />
    </MemoryRouter>,
  );

describe("SupportDetail — 조회 실패", () => {
  it("없는 제도(404)면 찾을 수 없다고 안내한다", async () => {
    mockedDetail.mockRejectedValueOnce(new HttpError(404, "지원금 상세 조회 실패 (404)"));
    renderDetail(99999);

    await screen.findByText("지원 제도를 찾을 수 없어요");
    expect(
      screen.getByText("존재하지 않거나 삭제된 제도예요. 목록에서 다시 선택해 주세요."),
    ).toBeTruthy();
  });

  it("그 외 HTTP 오류는 기존 재시도 안내를 유지한다", async () => {
    mockedDetail.mockRejectedValueOnce(new HttpError(500, "지원금 상세 조회 실패 (500)"));
    renderDetail(1);

    await screen.findByText("지원 제도를 불러오지 못했어요");
    expect(screen.getByText("잠시 후 다시 시도해 주세요.")).toBeTruthy();
    expect(screen.queryByText("지원 제도를 찾을 수 없어요")).toBeNull();
  });
});
