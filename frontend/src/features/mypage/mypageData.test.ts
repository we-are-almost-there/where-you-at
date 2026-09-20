import { afterEach, expect, it, vi } from "vitest";
import { createRecord, fetchRecordCards } from "./recordsApi";

vi.mock("./recordsApi", () => ({ createRecord: vi.fn(), fetchRecords: vi.fn(), fetchRecordCards: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it.each(["true", "false"])("완주 저장은 VITE_MYPAGE_API=%s와 무관하게 실행한다", async (enabled) => {
  vi.stubEnv("VITE_MYPAGE_API", enabled);
  vi.stubEnv("VITE_MYPAGE_PREVIEW", "true");
  vi.resetModules();
  const { saveMyRecord } = await import("./mypageData");
  const input = { courseId: 1, routeType: "도보" as const, distanceKm: 3, durationMs: 60000.6,
    paceSecPerKm: 20, finishedAt: "2026-09-20T01:02:03Z" };
  await saveMyRecord(input);
  expect(createRecord).toHaveBeenCalledTimes(1);
  expect(createRecord).toHaveBeenCalledWith({ ...input, durationMs: 60001 });
});

it("실제 카드 조회는 요청 페이지와 크기를 서버에 전달한다", async () => {
  vi.stubEnv("VITE_MYPAGE_API", "true");
  vi.stubEnv("VITE_MYPAGE_PREVIEW", "false");
  vi.resetModules();
  const data = { totalCount: 25, page: 3, size: 12, cards: [] };
  vi.mocked(fetchRecordCards).mockResolvedValueOnce(data);
  const { fetchMyRecordCards } = await import("./mypageData");
  expect(await fetchMyRecordCards(3, 12)).toEqual(data);
  expect(fetchRecordCards).toHaveBeenCalledWith(3, 12);
});

it("미리보기 목록도 서버와 같은 페이지 응답 형식을 사용한다", async () => {
  vi.stubEnv("DEV", true);
  vi.stubEnv("VITE_MYPAGE_PREVIEW", "true");
  vi.resetModules();
  const { fetchMyRecordCards } = await import("./mypageData");
  const first = await fetchMyRecordCards(1, 2);
  const second = await fetchMyRecordCards(2, 2);
  expect(first).toMatchObject({ page: 1, size: 2 });
  expect(second).toMatchObject({ page: 2, size: 2, totalCount: first.totalCount });
  expect(second.cards).toHaveLength(2);
  expect(first.cards.map((card) => card.id)).not.toEqual(second.cards.map((card) => card.id));
  expect(fetchRecordCards).not.toHaveBeenCalled();
});
