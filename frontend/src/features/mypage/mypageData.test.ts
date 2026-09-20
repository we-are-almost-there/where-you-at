import { afterEach, expect, it, vi } from "vitest";
import { createRecord } from "./recordsApi";

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
