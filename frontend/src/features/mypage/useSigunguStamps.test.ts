// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { fetchMyStamps, stampMyRegion } from "./mypageData";
import { useSigunguStamps } from "./useSigunguStamps";
import type { SigunguStampStatus } from "./types";

vi.mock("./mypageData", () => ({ fetchMyStamps: vi.fn(), stampMyRegion: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const available: SigunguStampStatus = { sigunguCode: "51110", status: "AVAILABLE", stampedAt: null };
const stamped: SigunguStampStatus = { ...available, status: "STAMPED", stampedAt: "2026-09-21T00:00:00Z" };

it("획득 수는 찍은 지역만 집계하고 저장 성공을 서버 시각으로 갱신한다", async () => {
  vi.mocked(fetchMyStamps).mockResolvedValue([available]);
  vi.mocked(stampMyRegion).mockResolvedValue(stamped);
  const { result } = renderHook(useSigunguStamps);
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.stamps).toEqual([]);
  await act(() => result.current.stamp("51110"));
  expect(result.current.stamps).toEqual([{ sigunguCode: "51110", stampedAt: stamped.stampedAt }]);
});

it("조회 실패 후 재시도한다", async () => {
  vi.mocked(fetchMyStamps).mockRejectedValueOnce(new Error()).mockResolvedValueOnce([stamped]);
  const { result } = renderHook(useSigunguStamps);
  await waitFor(() => expect(result.current.error).not.toBe(""));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.stamps).toHaveLength(1));
  expect(result.current.error).toBe("");
});

it("재시도 이전의 느린 조회 응답을 무시한다", async () => {
  let resolve!: (items: SigunguStampStatus[]) => void;
  vi.mocked(fetchMyStamps).mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce([stamped]);
  const { result } = renderHook(useSigunguStamps);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.stamps).toHaveLength(1));
  await act(async () => resolve([available]));
  expect(result.current.stamps).toHaveLength(1);
});
