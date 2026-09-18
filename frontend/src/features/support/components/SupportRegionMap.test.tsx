// @vitest-environment jsdom
//
// 활성 지역 조회를 둘러싼 동작을 본다 — 성공·실패·재시도로 색칠이 어떻게 갈리는지,
// 그리고 응답이 오기 전에 요청이 끊기는 경로(언마운트·supersede)까지.
// 지도 도형·배지 배치는 이 테스트의 관심사가 아니라 최소 도형만 흘려보낸다.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupportRegionMap } from "./SupportRegionMap";
import { fetchActiveRegionCodes } from "../supportApi";

vi.mock("../supportApi", () => ({ fetchActiveRegionCodes: vi.fn() }));

const mockedFetchActive = vi.mocked(fetchActiveRegionCodes);

const square = (x0: number, y0: number, x1: number, y1: number) => ({
  type: "Polygon" as const,
  coordinates: [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ],
});

const feature = (geometry: unknown, properties: unknown) => ({
  type: "Feature",
  geometry,
  properties,
});

// 시도 셋, 시군구 다섯. 폴백 목록(인구감소지역)에는 12780(가군) 하나만 들어 있다.
//   가도(12) ─ 가군(12780) 폴백에 있음
//            └ 다군(12800) 폴백에 없음 — 회색이어도 눌려야 하는 지역
//   나도(13) ─ 나군(12790) 폴백에 없음 — API만 활성으로 줄 수 있는 지역.
//              시도까지 통째로 폴백 밖이라 '색칠=클릭' 불변식을 시도 단위로 검사할 수 있다.
//            └ 라군(36620) byShape에 없음 — 패널을 열 수 없어 유일하게 막히는 경우
//   마도(14) ─ 마군(12820) 하나뿐 — 세종처럼 드릴다운이 무의미한 시도
const STATIC_FILES: Record<string, unknown> = {
  "/korea-sido.json": {
    type: "FeatureCollection",
    features: [
      feature(square(126, 34, 128.5, 38), { sido_code: "12", sido_name: "가도" }),
      feature(square(128.5, 34, 131, 38), { sido_code: "13", sido_name: "나도" }),
      feature(square(124.5, 34, 126, 38), { sido_code: "14", sido_name: "마도" }),
    ],
  },
  "/korea-all-regions.json": {
    type: "FeatureCollection",
    features: [
      feature(square(127, 35, 128, 36), { sgg_code: "36590", name: "가군" }),
      feature(square(129, 36, 130, 37), { sgg_code: "36600", name: "나군" }),
      feature(square(126.2, 34.2, 127, 35), { sgg_code: "36610", name: "다군" }),
      feature(square(129, 34.2, 130, 35.2), { sgg_code: "36620", name: "라군" }),
      feature(square(124.8, 35, 125.5, 36), { sgg_code: "36630", name: "마군" }),
    ],
  },
  "/region-index.json": {
    // 36620(라군)은 일부러 빼 둔다 — 행정 개편 전 도형처럼 대응하는 DB 지역이 없다
    byShape: { "36590": "12780", "36600": "12790", "36610": "12800", "36630": "12820" },
    // 41111은 도형이 없는 지역(행정구)을 흉내낸다 — 이름은 있지만 byShape에 없다
    names: {
      "12780": "가군",
      "12790": "나군",
      "12800": "다군",
      "12820": "마군",
      "41111": "다시 라구",
    },
    supportRegions: ["12780"],
  },
};

const badgeButtons = () =>
  [...document.querySelectorAll("foreignObject button")] as HTMLButtonElement[];

/** 배지와 별개인 실제 지도 도형. 전국·시도뷰 모두 SVG의 직접 자식 path로 그린다. */
const mapPaths = () => [...document.querySelectorAll("svg > path")] as SVGPathElement[];

const nameOf = (b: HTMLButtonElement) => b.textContent!.replace("›", "").trim();

/**
 * 색칠된 배지 이름 — 지금 신청 가능한 제도가 있는 곳.
 * 활성 배지만 화면 이름 뒤에 화살표를 그리므로 그 표식으로 가른다. aria-label은
 * 축약명에도 원래 이름을 읽어 주느라 활성 여부와 관계없이 붙을 수 있다.
 */
const activeSidoNames = () =>
  badgeButtons().filter((b) => b.textContent?.includes("›")).map(nameOf);

/** 지도에 이름이 붙은 배지 전부 — 색칠 여부와 무관하다 */
const badgeNames = () => badgeButtons().map(nameOf);

/** 누를 수 있는 배지 이름 — 회색이어도 패널을 열 수 있으면 여기 들어온다 */
const clickableNames = () => badgeButtons().filter((b) => !b.disabled).map(nameOf);

/** 지도가 URL을 바꾸는지 보려면 라우터의 현재 위치를 읽어야 한다 */
function LocationProbe() {
  return <div data-testid="location-search">{useLocation().search}</div>;
}

const currentSearch = () => screen.getByTestId("location-search").textContent;

function renderMap() {
  return render(
    <MemoryRouter>
      <SupportRegionMap />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("SupportRegionMap — 활성 지역 조회", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url in STATIC_FILES
          ? Promise.resolve({ ok: true, json: () => Promise.resolve(STATIC_FILES[url]) })
          : Promise.reject(new Error(`예상치 못한 요청: ${url}`)),
      ),
    );
  });

  afterEach(() => {
    // vitest globals가 꺼져 있어 testing-library의 자동 정리가 돌지 않는다.
    // 직접 지우지 않으면 다음 테스트에서 이전 렌더가 같이 잡힌다.
    cleanup();
    vi.unstubAllGlobals();
    // clearAllMocks는 호출 기록만 지우고 심어 둔 구현은 다음 테스트로 넘어간다.
    // mockReturnValue(pending())처럼 영영 안 끝나는 구현이 남으면, 구현을 안 심은
    // 테스트가 실패가 아니라 타임아웃까지 매달린다. reset이면 즉시 시끄럽게 깨진다.
    vi.resetAllMocks();
  });

  it("조회에 성공하면 응답 기준으로 색칠하고 안내를 띄우지 않는다", async () => {
    mockedFetchActive.mockResolvedValue(["12780"]);

    renderMap();

    await waitFor(() => expect(activeSidoNames()).toEqual(["가도"]));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("응답이 비어 있으면 아무 지역도 활성이 아니다", async () => {
    // 모든 제도가 끝난 상태. 폴백으로 넘어가 색칠하면 안 된다.
    mockedFetchActive.mockResolvedValue([]);

    renderMap();

    await waitFor(() => expect(screen.getByText("지역을 선택하세요")).toBeTruthy());
    expect(activeSidoNames()).toEqual([]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("응답을 기다리는 동안에는 색칠하지 않고 확인 중임을 알린다", async () => {
    // 폴백으로 미리 칠해 두면 사용자는 아무 표시 없이 낡은 색을 최신으로 믿는다.
    let resolve!: (codes: string[]) => void;
    mockedFetchActive.mockReturnValue(new Promise((r) => (resolve = r)));

    renderMap();

    await waitFor(() => expect(screen.getByText(/최신 신청 정보를 확인하는 중/)).toBeTruthy());
    expect(activeSidoNames()).toEqual([]);

    resolve(["12780"]);
    await waitFor(() => expect(activeSidoNames()).toEqual(["가도"]));
  });

  it("조회에 실패하면 폴백으로 색칠하되 사용자에게 알린다", async () => {
    // 지도를 아예 못 쓰게 하는 것보다는 낫다. 대신 상태를 드러낸다.
    mockedFetchActive.mockRejectedValue(new TypeError("Failed to fetch"));

    renderMap();

    await waitFor(() =>
      expect(screen.getByText(/최신 신청 정보를 불러오지 못해/)).toBeTruthy(),
    );
    expect(activeSidoNames()).toEqual(["가도"]); // supportRegions 폴백
  });

  it("다시 시도가 성공하면 색칠이 갱신되고 안내가 사라진다", async () => {
    mockedFetchActive.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    renderMap();

    const retry = await screen.findByRole("button", { name: "다시 시도" });
    expect(activeSidoNames()).toEqual(["가도"]); // 폴백 색칠

    // 재시도 결과가 비어 있으면 색칠이 실제로 걷혀야 한다 — 문구만 바뀌면 안 된다
    mockedFetchActive.mockResolvedValueOnce([]);
    retry.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(activeSidoNames()).toEqual([]);
  });

  it("그릴 도형이 없는 활성 지역이 와도 지도는 정상 동작한다", async () => {
    // 지도는 시군구 단위 도형만 가진다(#64에서 행정구를 시 단위로 병합). 지원 제도도
    // 시군구 단위로만 걸리므로 이런 응답은 나올 수 없고, 시드에 그런 코드를 넣으면
    // build 전 check:region-index가 막는다. 여기서는 그래도 지도가 깨지지 않는지만 본다.
    mockedFetchActive.mockResolvedValue(["12780", "41111"]);

    renderMap();

    // 그릴 수 있는 지역은 정상 색칠되고, 나머지는 조용히 빠진다(콘솔에는 남는다)
    await waitFor(() => expect(activeSidoNames()).toEqual(["가도"]));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("지역 배지를 누르면 그 지역 패널이 열린다", async () => {
    mockedFetchActive.mockResolvedValue(["12780"]);

    renderMap();

    await waitFor(() => expect(activeSidoNames()).toEqual(["가도"]));
    const badge = screen.getByRole("button", { name: /가도/ });
    badge.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // 시도 하나뿐이라 드릴다운하면 그 안의 시군구가 보이고, 눌러야 ?region= 이 붙는다
    await waitFor(() => expect(screen.getByRole("button", { name: /가군/ })).toBeTruthy());
    screen
      .getByRole("button", { name: /가군/ })
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await waitFor(() => expect(currentSearch()).toBe("?region=12780"));
  });

  it("지도 도형을 눌러도 배지와 같은 경로로 시도와 지역을 선택한다", async () => {
    mockedFetchActive.mockResolvedValue([]);

    renderMap();

    await waitFor(() => expect(mapPaths()).toHaveLength(3));
    // 전국뷰 첫 도형(가도) → 시도뷰
    mapPaths()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await waitFor(() => expect(mapPaths()).toHaveLength(2));

    // 시도뷰 두 번째 도형(다군) → 지역 패널
    mapPaths()[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await waitFor(() => expect(currentSearch()).toBe("?region=12800"));
  });

  it("다시 시도가 또 실패하면 안내와 폴백 색칠을 유지한다", async () => {
    mockedFetchActive.mockRejectedValue(new TypeError("Failed to fetch"));

    renderMap();

    const retry = await screen.findByRole("button", { name: "다시 시도" });
    retry.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await waitFor(() => expect(mockedFetchActive).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/최신 신청 정보를 불러오지 못해/)).toBeTruthy();
    expect(activeSidoNames()).toEqual(["가도"]);
  });

  // 색칠과 클릭 가능 여부는 기준이 다르다.
  //   색   = 지금 신청 가능한 제도가 있는가 (조회 결과)
  //   클릭 = 패널에 보여줄 게 있는가 — 대응하는 DB 지역이 있으면 항상 그렇다
  // 클릭을 색에 묶으면 조회가 끝나기 전에는 지도 전체가 눌리지 않고, 인구감소지역
  // 목록에 묶으면 같은 회색이 어디는 눌리고 어디는 안 눌린다.
  describe("색칠과 클릭 가능 여부", () => {
    it("지원 대상이 없는 시도도 지도에 이름이 뜬다", async () => {
      // 색칠된 시도만 라벨을 달면 서울·대전·울산·세종·제주가 이름 없는 땅으로 남는다
      mockedFetchActive.mockResolvedValue(["12780"]);

      renderMap();

      await waitFor(() => expect(activeSidoNames()).toEqual(["가도"]));
      expect(badgeNames()).toEqual(["가도", "나도", "마도"]);
    });

    it("조회를 기다리는 동안에도 모든 지역을 누를 수 있다", async () => {
      // 정적 파일만 받으면 쓸 수 있던 지도가 API 왕복을 기다리며 죽어 있으면 안 된다
      mockedFetchActive.mockReturnValue(new Promise<string[]>(() => {}));

      renderMap();

      await waitFor(() => expect(screen.getByText(/최신 신청 정보를 확인하는 중/)).toBeTruthy());
      expect(activeSidoNames()).toEqual([]); // 아직 아무것도 색칠하지 않는다
      expect(clickableNames()).toEqual(["가도", "나도", "마도"]); // 그래도 들어갈 수는 있다

      // 아직 모르는 사실을 '없다'고 단정하지 않는다 — 화면의 '확인 중' 칩을
      // 못 보는 사람에게는 배지 라벨이 유일한 문맥이다
      expect(screen.getByRole("button", { name: "가도 (신청 정보 확인 중)" })).toBeTruthy();
    });

    it("진행 중인 제도가 없는 회색 시군구도 패널을 열 수 있다", async () => {
      // 12800(다군)은 폴백 목록에도 없고 활성도 아니다 — 예전에는 여기서 막혔다.
      // 그래도 '제도 없음' 안내와 그 지역 코스 링크는 보여줄 수 있다.
      mockedFetchActive.mockResolvedValue([]);

      renderMap();

      await waitFor(() => expect(clickableNames()).toEqual(["가도", "나도", "마도"]));
      expect(activeSidoNames()).toEqual([]);

      screen
        .getByRole("button", { name: /가도/ })
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      const sgg = await screen.findByRole("button", { name: "다군 (진행 중인 제도 없음)" });
      sgg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await waitFor(() => expect(currentSearch()).toBe("?region=12800"));
    });

    it("하위 시군구가 하나뿐인 시도는 한 번에 그 도로 들어가며 패널을 연다", async () => {
      // 마도(14)에는 마군 하나뿐이다(세종). 드릴다운만 하면 같은 땅을 한 번 더 눌러야 하고,
      // 패널만 열고 전국뷰에 남으면 머리말은 '지역을 선택하세요'인데 패널은 마군이다.
      mockedFetchActive.mockResolvedValue([]);

      renderMap();

      const sido = await screen.findByRole("button", { name: /마도/ });
      sido.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      await waitFor(() => expect(currentSearch()).toBe("?region=12820"));
      // 지도도 그 도로 들어가 머리말이 패널과 같은 곳을 가리킨다
      expect(screen.getByText("마도")).toBeTruthy();
      expect(screen.queryByText("지역을 선택하세요")).toBeNull();
      // 다른 시도로 가는 길은 URL을 비우는 '← 전국으로'뿐이라 지도와 패널이 어긋날 수 없다
      expect(screen.queryByRole("button", { name: /가도/ })).toBeNull();
      screen
        .getByRole("button", { name: "← 전국으로" })
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await waitFor(() => expect(currentSearch()).toBe(""));
    });

    it("전국뷰는 시도명을 줄여 적고, 보조기기에는 원래 이름까지 읽어 준다", async () => {
      // 16곳 모두 이름을 달면 좁은 화면에서 배지가 옆 시도 땅으로 밀려난다.
      // 줄인 이름은 코스 탐색 지역 필터와 같은 표(SIDO_ABBR)를 따른다.
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
          const files: Record<string, unknown> = {
            ...STATIC_FILES,
            "/korea-sido.json": {
              type: "FeatureCollection",
              features: [
                feature(square(126, 34, 128.5, 38), { sido_code: "12", sido_name: "경상남도" }),
                feature(square(128.5, 34, 131, 38), { sido_code: "13", sido_name: "서울특별시" }),
              ],
            },
          };
          return Promise.resolve({ ok: true, json: () => Promise.resolve(files[url]) });
        }),
      );
      mockedFetchActive.mockResolvedValue(["12780"]); // 경상남도만 색칠

      renderMap();

      await waitFor(() => expect(badgeNames()).toEqual(["경남", "서울"]));
      // 이름표는 화면 글자로 시작한다 — 음성 조작은 보이는 글자('경남')로 버튼을 부른다
      expect(screen.getByRole("button", { name: "경남, 경상남도" })).toBeTruthy();
      // 원래 이름이 줄인 이름으로 시작하면 원래 이름만으로 충분하다
      expect(
        screen.getByRole("button", { name: "서울특별시 (진행 중인 제도 없음)" }),
      ).toBeTruthy();
    });

    it("색칠된 지역은 폴백 목록 밖이어도 누를 수 있다", async () => {
      // 12790(나군)은 도형은 있지만 supportRegions(인구감소지역)에는 없다.
      // API는 인구감소지역으로 제한되지 않으므로 이런 응답이 올 수 있다 —
      // 비인구감소지역에 제도가 하나 걸리면 그렇게 된다.
      // 색칠 기준과 클릭 기준이 갈라져 있으면 "보이는데 안 눌리는" 지역이 생긴다.
      mockedFetchActive.mockResolvedValue(["12780", "12790"]);

      renderMap();

      // 시도 단위 — 나도는 폴백 목록에 속한 시군구가 하나도 없다
      await waitFor(() => expect(activeSidoNames()).toEqual(["가도", "나도"]));

      // 시군구 단위 — 나군도 색칠된 이상 눌려야 한다
      screen
        .getByRole("button", { name: /나도/ })
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      await waitFor(() => expect(activeSidoNames()).toEqual(["나군"]));
      expect(clickableNames()).toEqual(["나군"]);
    });

    it("대응하는 지역이 없는 도형만 누를 수 없다", async () => {
      mockedFetchActive.mockResolvedValue(["12780"]);

      renderMap();

      await waitFor(() => expect(activeSidoNames()).toEqual(["가도"]));
      screen
        .getByRole("button", { name: /나도/ })
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      // 라군(36620)은 byShape에 없어 지역 코드를 모른다 — 열 패널이 없으므로 막는다
      const off = await screen.findByRole("button", { name: "라군 (선택할 수 없음)" });
      expect((off as HTMLButtonElement).disabled).toBe(true);
    });
  });

  // 진행 중인 요청을 ref 하나에 모아 두는 이유를 코드로 남긴다.
  // 위 테스트들은 응답이 화면에 어떻게 반영되는지만 보므로, 응답이 오기 전에
  // 요청이 끊기는 경로는 전부 검사 밖에 있다.
  describe("요청 수명", () => {
    /** 끝나지 않는 조회 — 응답 전에 무슨 일이 생기는지 보려면 이게 필요하다 */
    const pending = () => new Promise<string[]>(() => {});

    it("화면을 떠나면 진행 중인 조회를 취소한다", async () => {
      // 조회는 최대 8초를 기다린다. 그 사이 지도를 벗어나면 응답은 쓸 데가 없고,
      // 그대로 두면 사라진 화면의 상태를 되살리며 요청도 계속 물고 있는다.
      mockedFetchActive.mockReturnValue(pending());

      const { unmount } = renderMap();

      await waitFor(() => expect(mockedFetchActive).toHaveBeenCalledTimes(1));
      const signal = mockedFetchActive.mock.calls[0][0]!;
      expect(signal.aborted).toBe(false);

      unmount();
      expect(signal.aborted).toBe(true);
    });

    it("새 조회는 앞선 조회를 끊고 시작한다", async () => {
      mockedFetchActive.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      renderMap();
      const retry = await screen.findByRole("button", { name: "다시 시도" });
      const first = mockedFetchActive.mock.calls[0][0]!;

      mockedFetchActive.mockReturnValue(pending());
      retry.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      await waitFor(() => expect(mockedFetchActive).toHaveBeenCalledTimes(2));
      // 앞선 요청은 끊기고, 새 요청만 살아서 화면을 갱신할 자격을 갖는다
      expect(first.aborted).toBe(true);
      expect(mockedFetchActive.mock.calls[1][0]!.aborted).toBe(false);
    });
  });
});
