// @vitest-environment jsdom
// 찜 상태 저장소 테스트 (vitest, savedApi mock).
//
// 저장소가 모듈 수준 상태라 테스트마다 모듈을 새로 불러온다.
// 테스트 범위:
//   - 키 목록은 여러 번 불러도 한 번만 받는다
//   - 토글은 누르는 즉시 반영하고, 실패하면 되돌린 뒤 오류를 던진다
//   - 요청이 끝나기 전에는 busy이고 같은 키를 다시 토글해도 요청이 늘지 않는다
//   - 로그아웃(clearSavedKeys) 뒤에는 상태를 "모름"으로 되돌린다
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSavedCourseKeys = vi.fn();
const addSavedCourse = vi.fn();
const removeSavedCourse = vi.fn();
const { expireAuthSession } = vi.hoisted(() => ({ expireAuthSession: vi.fn() }));

vi.mock("../auth/useAuth", () => ({ expireAuthSession }));

vi.mock("./savedApi", () => ({
  getSavedCourseKeys: () => getSavedCourseKeys(),
  addSavedCourse: (...args: unknown[]) => addSavedCourse(...args),
  removeSavedCourse: (...args: unknown[]) => removeSavedCourse(...args),
}));

async function loadStore() {
  vi.resetModules();
  return import("./savedStore");
}

beforeEach(() => {
  getSavedCourseKeys.mockResolvedValue([{ courseId: 12, routeType: "자전거" }]);
  addSavedCourse.mockResolvedValue(undefined);
  removeSavedCourse.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("savedStore", () => {
  it("받기 전에는 모름이고, 받으면 찜한 종목만 true다", async () => {
    const store = await loadStore();
    const { result } = renderHook(() => store.useSavedCourse(12, "자전거"));
    const walk = renderHook(() => store.useSavedCourse(12, "도보"));

    expect(result.current.saved).toBeUndefined();
    expect(result.current.loadStatus).toBe("idle");

    act(() => store.ensureSavedKeysLoaded());

    await waitFor(() => expect(result.current.saved).toBe(true));
    expect(result.current.loadStatus).toBe("ready");
    expect(walk.result.current.saved).toBe(false);
  });

  it("여러 번 불러도 키 목록은 한 번만 받는다", async () => {
    const store = await loadStore();
    renderHook(() => store.useSavedCourse(12, "자전거"));

    act(() => {
      store.ensureSavedKeysLoaded();
      store.ensureSavedKeysLoaded();
    });
    await waitFor(() => expect(getSavedCourseKeys).toHaveBeenCalledTimes(1));

    act(() => store.ensureSavedKeysLoaded());
    expect(getSavedCourseKeys).toHaveBeenCalledTimes(1);
  });

  it("이미 받은 찜 목록으로 채우면 요청 없이 하트가 켜진다", async () => {
    const store = await loadStore();
    const { result } = renderHook(() => store.useSavedCourse(3, "도보"));

    act(() => store.seedSavedKeys([{ courseId: 3, routeType: "도보" }]));

    expect(result.current.saved).toBe(true);
    expect(getSavedCourseKeys).not.toHaveBeenCalled();
  });

  it("찜하면 응답을 기다리기 전에 켜지고 요청이 끝나도 유지된다", async () => {
    let finish = () => {};
    addSavedCourse.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const store = await loadStore();
    const { result } = renderHook(() => store.useSavedCourse(3, "도보"));
    act(() => store.seedSavedKeys([]));

    let done!: Promise<void>;
    act(() => {
      done = store.toggleSavedCourse(3, "도보");
    });

    // 아직 서버 응답 전이다.
    expect(result.current.saved).toBe(true);
    expect(result.current.busy).toBe(true);
    expect(addSavedCourse).toHaveBeenCalledWith(3, "도보");

    await act(async () => {
      finish();
      await done;
    });

    expect(result.current.saved).toBe(true);
    expect(result.current.busy).toBe(false);
  });

  it("찜을 해제하면 삭제를 부른다", async () => {
    const store = await loadStore();
    const { result } = renderHook(() => store.useSavedCourse(12, "자전거"));
    act(() => store.seedSavedKeys([{ courseId: 12, routeType: "자전거" }]));

    await act(async () => {
      await store.toggleSavedCourse(12, "자전거");
    });

    expect(removeSavedCourse).toHaveBeenCalledWith(12, "자전거");
    expect(result.current.saved).toBe(false);
  });

  it("실패하면 원래 상태로 되돌리고 오류를 던진다", async () => {
    addSavedCourse.mockRejectedValue(new Error("500"));
    const store = await loadStore();
    const { result } = renderHook(() => store.useSavedCourse(3, "도보"));
    act(() => store.seedSavedKeys([]));

    await act(async () => {
      await expect(store.toggleSavedCourse(3, "도보")).rejects.toThrow("500");
    });

    expect(result.current.saved).toBe(false);
    expect(result.current.busy).toBe(false);
    expect(expireAuthSession).not.toHaveBeenCalled();
  });

  it("찜 추가가 401이면 상태를 되돌리고 로컬 인증 세션을 만료시킨다", async () => {
    const store = await loadStore();
    const { HttpError } = await import("../../lib/http");
    const error = new HttpError(401, "expired");
    addSavedCourse.mockRejectedValue(error);
    const { result } = renderHook(() => store.useSavedCourse(3, "도보"));
    act(() => store.seedSavedKeys([]));

    await act(async () => {
      await expect(store.toggleSavedCourse(3, "도보")).rejects.toBe(error);
    });

    expect(addSavedCourse).toHaveBeenCalledWith(3, "도보");
    expect(result.current.saved).toBe(false);
    expect(result.current.busy).toBe(false);
    expect(expireAuthSession).toHaveBeenCalledTimes(1);
  });

  it("찜 해제가 401이면 상태를 되돌리고 로컬 인증 세션을 만료시킨다", async () => {
    const store = await loadStore();
    const { HttpError } = await import("../../lib/http");
    const error = new HttpError(401, "expired");
    removeSavedCourse.mockRejectedValue(error);
    const { result } = renderHook(() => store.useSavedCourse(12, "자전거"));
    act(() => store.seedSavedKeys([{ courseId: 12, routeType: "자전거" }]));

    await act(async () => {
      await expect(store.toggleSavedCourse(12, "자전거")).rejects.toBe(error);
    });

    expect(removeSavedCourse).toHaveBeenCalledWith(12, "자전거");
    expect(result.current.saved).toBe(true);
    expect(result.current.busy).toBe(false);
    expect(expireAuthSession).toHaveBeenCalledTimes(1);
  });

  it("보내는 중에는 같은 키를 다시 눌러도 요청이 늘지 않는다", async () => {
    let finish = () => {};
    addSavedCourse.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const store = await loadStore();
    const { result } = renderHook(() => store.useSavedCourse(3, "도보"));
    act(() => store.seedSavedKeys([]));

    let first!: Promise<void>;
    act(() => {
      first = store.toggleSavedCourse(3, "도보");
    });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      await store.toggleSavedCourse(3, "도보");
      finish();
      await first;
    });

    expect(addSavedCourse).toHaveBeenCalledTimes(1);
    expect(removeSavedCourse).not.toHaveBeenCalled();
  });

  it("로그아웃하면 모름으로 되돌리고, 다시 불러도 상태를 새로 만들지 않는다", async () => {
    const store = await loadStore();
    const { result } = renderHook(() => store.useSavedCourse(12, "자전거"));
    act(() => store.seedSavedKeys([{ courseId: 12, routeType: "자전거" }]));

    act(() => store.clearSavedKeys());
    expect(result.current.saved).toBeUndefined();

    const before = result.current;
    act(() => store.clearSavedKeys());
    expect(result.current.saved).toBeUndefined();
    expect(result.current.busy).toBe(before.busy);
  });

  it("로그아웃 뒤 늦게 도착한 이전 세션 응답을 버리고 다음 로그인에서 새로 받는다", async () => {
    let finishOldRequest!: (keys: { courseId: number; routeType: string }[]) => void;
    getSavedCourseKeys
      .mockReturnValueOnce(new Promise((resolve) => (finishOldRequest = resolve)))
      .mockResolvedValueOnce([{ courseId: 3, routeType: "도보" }]);
    const store = await loadStore();
    const { result } = renderHook(() => store.useSavedCourse(12, "자전거"));

    act(() => store.ensureSavedKeysLoaded());
    act(() => store.clearSavedKeys());
    await act(async () => {
      finishOldRequest([{ courseId: 12, routeType: "자전거" }]);
      await Promise.resolve();
    });

    expect(result.current.saved).toBeUndefined();

    act(() => store.ensureSavedKeysLoaded());
    await waitFor(() => expect(getSavedCourseKeys).toHaveBeenCalledTimes(2));
    expect(result.current.saved).toBe(false);
  });

  it("seed 뒤 늦게 도착한 키 조회 응답이 최신 캐시를 덮어쓰지 않는다", async () => {
    let finishOldRequest!: (keys: { courseId: number; routeType: string }[]) => void;
    getSavedCourseKeys.mockReturnValue(new Promise((resolve) => (finishOldRequest = resolve)));
    const store = await loadStore();
    const oldCourse = renderHook(() => store.useSavedCourse(12, "자전거"));
    const seededCourse = renderHook(() => store.useSavedCourse(3, "도보"));

    act(() => store.ensureSavedKeysLoaded());
    act(() => store.seedSavedKeys([{ courseId: 3, routeType: "도보" }]));
    await act(async () => {
      finishOldRequest([{ courseId: 12, routeType: "자전거" }]);
      await Promise.resolve();
    });

    expect(oldCourse.result.current.saved).toBe(false);
    expect(seededCourse.result.current.saved).toBe(true);
    expect(seededCourse.result.current.loadStatus).toBe("ready");
  });

  it("seed 뒤 늦게 도착한 키 조회 오류를 버린다", async () => {
    let failOldRequest!: (error: unknown) => void;
    getSavedCourseKeys.mockReturnValue(new Promise((_, reject) => (failOldRequest = reject)));
    const store = await loadStore();
    const { HttpError } = await import("../../lib/http");
    const { result } = renderHook(() => store.useSavedCourse(3, "도보"));

    act(() => store.ensureSavedKeysLoaded());
    act(() => store.seedSavedKeys([{ courseId: 3, routeType: "도보" }]));
    await act(async () => {
      failOldRequest(new HttpError(401, "expired"));
      await Promise.resolve();
    });

    expect(result.current.saved).toBe(true);
    expect(result.current.loadStatus).toBe("ready");
    expect(expireAuthSession).not.toHaveBeenCalled();
  });

  it("키 목록을 받지 못하면 현재 화면에서 다시 시도할 수 있다", async () => {
    getSavedCourseKeys
      .mockRejectedValueOnce(new Error("500"))
      .mockResolvedValueOnce([{ courseId: 12, routeType: "자전거" }]);
    const store = await loadStore();
    const { result } = renderHook(() => store.useSavedCourse(12, "자전거"));

    act(() => store.ensureSavedKeysLoaded());
    await waitFor(() => expect(result.current.loadStatus).toBe("error"));

    expect(result.current.saved).toBeUndefined();
    await act(async () => {
      await store.toggleSavedCourse(12, "자전거");
    });
    expect(addSavedCourse).not.toHaveBeenCalled();

    await act(() => store.retrySavedKeys());

    expect(getSavedCourseKeys).toHaveBeenCalledTimes(2);
    expect(result.current.saved).toBe(true);
    expect(result.current.loadStatus).toBe("ready");
  });

  it("키 목록 조회가 401이면 로컬 인증 세션을 만료시킨다", async () => {
    const store = await loadStore();
    const { HttpError } = await import("../../lib/http");
    getSavedCourseKeys.mockRejectedValue(new HttpError(401, "expired"));
    const { result } = renderHook(() => store.useSavedCourse(12, "자전거"));

    act(() => store.ensureSavedKeysLoaded());

    await waitFor(() => expect(result.current.loadStatus).toBe("error"));
    expect(expireAuthSession).toHaveBeenCalledTimes(1);
  });
});
