// @vitest-environment jsdom
//
// 활성 지역 조회가 실패했을 때의 동작만 본다.
// 지도 도형·배지 배치는 이 테스트의 관심사가 아니라 최소 도형만 흘려보낸다.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
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

// 시도 하나에 시군구 둘. 12780만 폴백 목록(지원 대상)에 들어 있다.
const STATIC_FILES: Record<string, unknown> = {
  "/korea-sido.json": {
    type: "FeatureCollection",
    features: [feature(square(126, 34, 130, 38), { sido_code: "12", sido_name: "가도" })],
  },
  "/korea-all-regions.json": {
    type: "FeatureCollection",
    features: [
      feature(square(127, 35, 128, 36), { sgg_code: "36590", name: "가군" }),
      feature(square(128, 36, 129, 37), { sgg_code: "36600", name: "나군" }),
    ],
  },
  "/region-index.json": {
    byShape: { "36590": "12780", "36600": "12790" },
    names: { "12780": "가군", "12790": "나군" },
    supportRegions: ["12780"],
  },
};

/** 전국뷰에서 색칠돼 클릭 가능한 시도 배지 이름 */
const activeSidoNames = () =>
  [...document.querySelectorAll("foreignObject button")]
    .filter((b) => !(b as HTMLButtonElement).disabled)
    .map((b) => b.textContent!.replace("›", "").trim());

function renderMap() {
  return render(
    <MemoryRouter>
      <SupportRegionMap />
    </MemoryRouter>,
  );
}

describe("SupportRegionMap — 활성 지역 조회 실패", () => {
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
    vi.clearAllMocks();
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

  it("다시 시도가 또 실패하면 안내와 폴백 색칠을 유지한다", async () => {
    mockedFetchActive.mockRejectedValue(new TypeError("Failed to fetch"));

    renderMap();

    const retry = await screen.findByRole("button", { name: "다시 시도" });
    retry.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await waitFor(() => expect(mockedFetchActive).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/최신 신청 정보를 불러오지 못해/)).toBeTruthy();
    expect(activeSidoNames()).toEqual(["가도"]);
  });
});
