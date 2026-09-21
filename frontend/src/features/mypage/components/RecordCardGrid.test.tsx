// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import RecordCardGrid from "./RecordCardGrid";
import type { SavedRecordCard } from "../types";

const card: SavedRecordCard = {
  id: 1, imageUrl: "https://example.test/card.png", createdAt: "2026-09-20T00:00:00Z",
  record: { id: 1, courseId: 1, courseName: "코스", routeType: "도보", distanceKm: 3,
    durationMs: 60000, paceSecPerKm: 20, finishedAt: "2026-09-20T00:00:00Z", isCompleted: true },
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("이미지 준비가 끝나야 저장할 수 있고 클릭 중 즉시 공유한다", async () => {
  let finish!: (blob: Blob) => void;
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => new Promise<Blob>((resolve) => { finish = resolve; }) });
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", { canShare: () => true, share });
  render(<RecordCardGrid cards={[card]} />);
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () => finish(new Blob(["png"], { type: "image/png" })));
  const button = screen.getByRole("button", { name: "이미지 저장" });
  await act(async () => {
    fireEvent.click(button);
    expect(share).toHaveBeenCalledTimes(1);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("이미지 준비 실패 후 다시 준비하고 공유 취소는 오류로 표시하지 않는다", async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("offline"))
    .mockResolvedValue({ ok: true, blob: async () => new Blob(["png"], { type: "image/png" }) });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("navigator", { canShare: () => true,
    share: vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")) });
  render(<RecordCardGrid cards={[card]} />);
  fireEvent.click(await screen.findByRole("button", { name: "이미지 준비 재시도" }));
  const button = await screen.findByRole("button", { name: "이미지 저장" });
  await act(async () => {
    fireEvent.click(button);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
});
