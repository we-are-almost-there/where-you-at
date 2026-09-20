// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRecords } from "./useRecords";
import { fetchMyRecordCards, fetchMyRecords } from "./mypageData";
import { RecordApiError } from "./recordsErrors";
import type { RecordCardPage } from "./types";

vi.mock("./mypageData", () => ({ fetchMyRecords: vi.fn(), fetchMyRecordCards: vi.fn() }));
const pageData = (page: number): RecordCardPage => ({ totalCount: 36, page, size: 12, cards: [] });
beforeEach(() => {
  vi.mocked(fetchMyRecords).mockReset().mockResolvedValue([]);
  vi.mocked(fetchMyRecordCards).mockReset().mockImplementation(async (page = 1) => pageData(page));
});
afterEach(cleanup);

it.each(["성공", "실패"])("이전 페이지의 늦은 %s 응답이 현재 페이지를 덮어쓰지 않는다", async (outcome) => {
  let resolve!: (data: RecordCardPage) => void;
  let reject!: (error: Error) => void;
  vi.mocked(fetchMyRecordCards).mockImplementationOnce(() => new Promise((done, fail) => { resolve = done; reject = fail; }));
  const { result, rerender } = renderHook(({ page }) => useRecords(page), { initialProps: { page: 1 } });
  rerender({ page: 2 });
  expect(result.current.status).toBe("loading");
  await waitFor(() => expect(result.current).toMatchObject({ status: "ready", cardPage: { page: 2 } }));
  await act(async () => { if (outcome === "성공") resolve(pageData(1)); else reject(new Error("이전 요청 실패")); });
  expect(result.current).toMatchObject({ status: "ready", cardPage: { page: 2 } });
});

it("페이지가 달라지면 이전 목록을 숨기고 새 페이지를 불러온다", async () => {
  const { result, rerender } = renderHook(({ page }) => useRecords(page), { initialProps: { page: 1 } });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  vi.mocked(fetchMyRecordCards).mockReturnValueOnce(new Promise(() => {}));
  rerender({ page: 3 });
  expect(result.current.status).toBe("loading");
});

it("이전에 실패한 페이지로 돌아와 조회에 성공하면 이전 오류를 지운다", async () => {
  vi.mocked(fetchMyRecordCards).mockRejectedValueOnce(new Error("조회 실패"));
  const { result, rerender } = renderHook(({ page }) => useRecords(page), { initialProps: { page: 1 } });
  await waitFor(() => expect(result.current.status).toBe("error"));
  rerender({ page: 2 });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  rerender({ page: 1 });
  await waitFor(() => expect(result.current).toMatchObject({ status: "ready", cardPage: { page: 1 } }));
});

it("서버의 기능 비활성화 응답을 일반 조회 오류와 구분한다", async () => {
  vi.mocked(fetchMyRecordCards).mockRejectedValueOnce(new RecordApiError(503, "아직 제공하지 않는 기능입니다."));
  const { result } = renderHook(() => useRecords());
  await waitFor(() => expect(result.current).toMatchObject({ status: "error", error: { title: expect.stringContaining("아직 제공하지 않는 기능") } }));
});
