// @vitest-environment jsdom
import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkError } from "../../lib/http";
import { Nearby, type NearbyHandle } from "./Nearby";
import { getNearbySpots } from "./nearbyApi";
import type { NearbySpotsPage } from "./nearbyApi";
import type { NearbySpot } from "./types";

vi.mock("./nearbyApi", () => ({
  getNearbySpots: vi.fn(),
}));

vi.mock("./components/CategoryFilter", () => ({
  CategoryFilter: () => null,
}));

vi.mock("./components/SpotDetailSheet", () => ({
  SpotDetailSheet: () => null,
}));

vi.mock("./components/SpotCard", () => ({
  SpotCard: ({ spot }: { spot: NearbySpot }) => (
    <div data-testid="spot">{spot.id}</div>
  ),
}));

const api = vi.mocked(getNearbySpots);
const observers = new Set<IntersectionObserverCallback>();

class MockIntersectionObserver {
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe() {
    observers.add(this.callback);
  }

  unobserve() {
    observers.delete(this.callback);
  }

  disconnect() {
    observers.delete(this.callback);
  }
}

function makePage(
  ids: string[],
  version = "v1",
  totalCount = 10,
): NearbySpotsPage {
  return {
    totalCount,
    listVersion: version,
    spots: ids.map((id) => ({
      id,
      category: "attraction",
      name: id,
      address: "",
      image_url: "",
      lat: 37,
      lng: 127,
      distance_m: 100,
      duration_minutes: 1,
    })),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function visibleIds() {
  return screen.queryAllByTestId("spot").map((element) => element.textContent);
}

async function mount() {
  let view!: ReturnType<typeof render>;

  await act(async () => {
    view = render(
      <Nearby
        courseId={1}
        category="attraction"
        onCategoryChange={() => {}}
      />,
    );
  });

  return view;
}

async function scrollToEnd(times = 1) {
  await act(async () => {
    // 같은 observer 콜백이 연속 호출되는 상황도 재현한다.
    const callbacks = [...observers];

    for (let index = 0; index < times; index += 1) {
      for (const callback of callbacks) {
        callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      }
    }
  });
}

beforeEach(() => {
  api.mockReset();
  observers.clear();
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
  cleanup();
  observers.clear();
  vi.unstubAllGlobals();
});

describe("Nearby 무한 스크롤", () => {
  it("추가 로딩 재시도는 실패한 페이지를 다시 요청하고 목록과 선택을 유지한다", async () => {
    const pending = deferred<NearbySpotsPage>();
    api
      .mockResolvedValueOnce(makePage(["A"]))
      .mockResolvedValueOnce(makePage(["B"]))
      .mockRejectedValueOnce(
        new NetworkError(new TypeError("Failed to fetch")),
      )
      .mockReturnValueOnce(pending.promise);
    const nearbyRef = createRef<NearbyHandle>();
    const onSelectedChange = vi.fn();
    await act(async () => {
      render(<Nearby ref={nearbyRef} courseId={1} category="attraction"
        onCategoryChange={() => {}} onSelectedChange={onSelectedChange} />);
    });
    await scrollToEnd();
    act(() => nearbyRef.current?.selectSpotById("B"));
    const selectionCalls = onSelectedChange.mock.calls.length;
    const firstCard = screen.getAllByTestId("spot")[0];
    await scrollToEnd();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    });
    expect(visibleIds()).toEqual(["A", "B"]);
    expect(screen.getAllByTestId("spot")[0]).toBe(firstCard);
    await scrollToEnd(3);
    expect(api.mock.calls.map((call) => call[3])).toEqual([1, 2, 3, 3]);
    await act(async () => pending.resolve(makePage(["C"])));
    expect(visibleIds()).toEqual(["A", "B", "C"]);
    expect(onSelectedChange).toHaveBeenCalledTimes(selectionCalls);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("연결 오류에 공통 안내와 재시도·목록 이동 버튼을 표시한다", async () => {
    api.mockRejectedValueOnce(
      new NetworkError(new TypeError("Failed to fetch")),
    );

    const onBack = vi.fn();

    await act(async () => {
      render(
        <Nearby
          courseId={1}
          category="attraction"
          onCategoryChange={() => {}}
          onBack={onBack}
        />,
      );
    });

    expect(
      screen.getByRole("heading", { name: "서버에 연결할 수 없어요" }),
    ).toBeTruthy();

    expect(screen.getByRole("alert").textContent).toContain(
      "일시적인 통신 문제로 정보를 불러오지 못했습니다.",
    );

    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("같은 버전의 다음 페이지를 합치고 중복 ID를 제거한다", async () => {
    api
      .mockResolvedValueOnce(makePage(["A", "B"]))
      .mockResolvedValueOnce(makePage(["B", "C"]));

    await mount();
    await scrollToEnd();

    expect(visibleIds()).toEqual(["A", "B", "C"]);
    expect(api).toHaveBeenNthCalledWith(
      2, 1, "attraction", "trail", 2, expect.any(AbortSignal),
    );
  });

  it("추가 로딩 중 연속 스크롤이 발생해도 요청을 한 번만 보낸다", async () => {
    const pending = deferred<NearbySpotsPage>();

    api
      .mockResolvedValueOnce(makePage(["A"]))
      .mockReturnValueOnce(pending.promise);

    await mount();
    await scrollToEnd(3);

    expect(api).toHaveBeenCalledTimes(2);

    await act(async () => {
      pending.resolve(makePage(["B"]));
    });

    expect(visibleIds()).toEqual(["A", "B"]);
  });

  it("다른 버전의 빈 페이지는 종료로 처리하지 않고 첫 페이지를 재조회한다", async () => {
    api
      .mockResolvedValueOnce(makePage(["A"], "v1"))
      .mockResolvedValueOnce(makePage([], "v2", 1))
      .mockResolvedValueOnce(makePage(["X"], "v2", 1));

    await mount();
    await scrollToEnd();

    expect(api.mock.calls.map((call) => call[3])).toEqual([1, 2, 1]);
    expect(visibleIds()).toEqual(["X"]);
  });

  it("같은 버전의 빈 페이지를 받으면 추가 로딩을 종료한다", async () => {
    api
      .mockResolvedValueOnce(makePage(["A"], "v1", 100))
      .mockResolvedValueOnce(makePage([], "v1", 100));

    await mount();
    await scrollToEnd();
    await scrollToEnd();

    expect(api).toHaveBeenCalledTimes(2);
    expect(visibleIds()).toEqual(["A"]);
    expect(observers.size).toBe(0);
  });

  it("재조회 실패 후 오류를 표시하고 수동 재시도가 가능하다", async () => {
    api
      .mockResolvedValueOnce(makePage(["A"], "v1"))
      .mockResolvedValueOnce(makePage(["B"], "v2"))
      .mockRejectedValueOnce(new Error("재조회 실패"))
      .mockResolvedValueOnce(makePage(["X"], "v3", 1));

    await mount();
    await scrollToEnd();

    expect(screen.getByRole("alert").textContent).toContain("주변 정보를 불러오지 못했어요");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "다시 시도" }),
      );
    });

    expect(api.mock.calls.map((call) => call[3])).toEqual([1, 2, 1, 1]);
    expect(visibleIds()).toEqual(["X"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("자동 재조회는 연속 3회까지만 수행한다", async () => {
    api
      .mockResolvedValueOnce(makePage(["A"], "v1"))
      .mockResolvedValueOnce(makePage(["B"], "v2"))
      .mockResolvedValueOnce(makePage(["B"], "v2"))
      .mockResolvedValueOnce(makePage(["C"], "v3"))
      .mockResolvedValueOnce(makePage(["C"], "v3"))
      .mockResolvedValueOnce(makePage(["D"], "v4"))
      .mockResolvedValueOnce(makePage(["D"], "v4"))
      .mockResolvedValueOnce(makePage(["E"], "v5"));

    await mount();

    for (let index = 0; index < 4; index += 1) {
      await scrollToEnd();
    }

    expect(api.mock.calls.map((call) => call[3])).toEqual([
      1, 2, 1, 2, 1, 2, 1, 2,
    ]);
    expect(screen.getByRole("alert").textContent).toContain(
      "목록이 계속 변경",
    );

    await scrollToEnd();
    expect(api).toHaveBeenCalledTimes(8);
  });

  it("언마운트 이후 도착한 응답으로 재조회나 지도 알림을 실행하지 않는다", async () => {
    const pending = deferred<NearbySpotsPage>();
    const onSpotsChange = vi.fn();

    api
      .mockResolvedValueOnce(makePage(["A"], "v1"))
      .mockReturnValueOnce(pending.promise);

    let view!: ReturnType<typeof render>;

    await act(async () => {
      view = render(
        <Nearby
          courseId={1}
          category="attraction"
          onCategoryChange={() => {}}
          onSpotsChange={onSpotsChange}
        />,
      );
    });

    await scrollToEnd();
    view.unmount();

    const notificationCount = onSpotsChange.mock.calls.length;

    await act(async () => {
      pending.resolve(makePage(["X"], "v2"));
    });

    expect(api).toHaveBeenCalledTimes(2);
    expect(onSpotsChange).toHaveBeenCalledTimes(notificationCount);
  });

  it("추가 요청 실패 시 기존 목록을 유지하고 자동 재요청을 멈춘다", async () => {
    api
      .mockResolvedValueOnce(makePage(["A"]))
      .mockRejectedValueOnce(new Error("네트워크 오류"));

    await mount();
    await scrollToEnd();

    expect(visibleIds()).toEqual(["A"]);
    expect(screen.getByRole("alert").textContent).toContain("주변 정보를 더 불러오지 못했어요");

    await scrollToEnd();
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("부모가 매 렌더마다 새 콜백을 넘겨도 목록을 재요청하지 않는다", async () => {
    api.mockResolvedValueOnce(makePage(["A", "B"]));

    const view = render(
      <Nearby
        courseId={1}
        category="attraction"
        onCategoryChange={() => {}}
        onSpotsChange={() => {}}
        onSelectedChange={() => {}}
      />,
    );
    await act(async () => {});

    expect(api).toHaveBeenCalledTimes(1);

    // 부모(CourseDetail)의 리렌더를 흉내낸다: onReset이 의존하는
    // onSpotsChange/onSelectedChange/onCategoryChange를 매번 새 참조로 넘긴다.
    for (let index = 0; index < 3; index += 1) {
      view.rerender(
        <Nearby
          courseId={1}
          category="attraction"
          onCategoryChange={() => {}}
          onSpotsChange={() => {}}
          onSelectedChange={() => {}}
        />,
      );
      await act(async () => {});
    }

    // effect가 재실행되지 않았다면 첫 페이지 요청은 여전히 1회여야 한다.
    expect(api).toHaveBeenCalledTimes(1);
    expect(visibleIds()).toEqual(["A", "B"]);

    view.unmount();
  });

  it("부모 리렌더로 상세 시트가 즉시 닫히지 않는다(선택 상태 유지)", async () => {
    api.mockResolvedValueOnce(makePage(["A", "B"]));

    const nearbyRef = createRef<NearbyHandle>();
    const onSelectedChange = vi.fn();

    const view = render(
      <Nearby
        ref={nearbyRef}
        courseId={1}
        category="attraction"
        onCategoryChange={() => {}}
        onSelectedChange={onSelectedChange}
      />,
    );
    await act(async () => {});

    // 지도 마커 클릭과 동일한 경로로 스팟을 선택한다(=상세 시트 오픈).
    act(() => {
      nearbyRef.current?.selectSpotById("A");
    });

    // 마운트 시 loadFirstPage가 onReset()을 통해 onSelectedChange(null)을 1회 호출하므로,
    // 이후 selectSpotById로 인한 호출까지 합쳐 기준선은 2회다.
    const callsAfterSelect = onSelectedChange.mock.calls.length;
    expect(onSelectedChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "A" }),
    );

    // 부모가 리렌더되며 onSelectedChange를 새 참조로 다시 내려준다
    // (예: 스팟 선택 자체가 부모 state를 바꿔 재렌더를 유발하는 상황).
    view.rerender(
      <Nearby
        ref={nearbyRef}
        courseId={1}
        category="attraction"
        onCategoryChange={() => {}}
        onSelectedChange={onSelectedChange}
      />,
    );
    await act(async () => {});

    // 리렌더만으로 목록이 재조회되어 onReset()이 불리면 안 된다 —
    // 불렸다면 onSelectedChange(null)로 시트가 즉시 닫혔을 것이다.
    expect(onSelectedChange).toHaveBeenCalledTimes(callsAfterSelect);
    expect(api).toHaveBeenCalledTimes(1);

    view.unmount();
  });
});
