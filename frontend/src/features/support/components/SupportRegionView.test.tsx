// @vitest-environment jsdom
//
// 지역을 바꾸는 동안 직전 지역의 내용이 새 지역 것으로 보이지 않는지 본다.
// 제목·목록·환급 계산기가 각각 다른 시점에 갱신되면, 그 틈에서 사용자는
// '경상남도 고성군' 제목 아래 화천 제도를 보고 눌러 화천 상세로 들어간다.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupportRegionView } from "./SupportRegionView";
import { fetchSupportList } from "../supportApi";
import type { SupportListItem } from "../support.types";

vi.mock("../supportApi", () => ({ fetchSupportList: vi.fn() }));

const mockedList = vi.mocked(fetchSupportList);

// refund_type '정률'이라 이 항목이 있으면 아래 환급 계산기도 함께 열린다
const item = (id: number, title: string): SupportListItem => ({
  id,
  title,
  agency: "기관",
  summary: null,
  support_type: "반값여행",
  refund_type: "정률",
  max_amount: 100000,
  end_date: null,
  badge_type: "refund",
});

const NAMES = {
  byShape: {},
  names: { "51790": "강원특별자치도 화천군", "48820": "경상남도 고성군" },
  supportRegions: [],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(NAMES) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

const renderAt = (regionCode: string) =>
  render(
    <MemoryRouter>
      <SupportRegionView regionCode={regionCode} />
    </MemoryRouter>,
  );

describe("SupportRegionView — 지역 전환", () => {
  it("새 지역 목록을 기다리는 동안 직전 지역 제도를 보여주지 않는다", async () => {
    mockedList.mockResolvedValueOnce([item(1, "화천 반값여행")]);
    const { rerender } = renderAt("51790");

    await screen.findByText("화천 반값여행");
    // 환급형 제도가 있으므로 계산기도 함께 떠 있다
    expect(screen.getByText("예상 환급 계산")).toBeTruthy();

    // 새 지역 응답을 붙잡아 둔 채 지역만 바꾼다 — 전환 중인 순간을 고정한다
    let resolve!: (v: SupportListItem[]) => void;
    mockedList.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    rerender(
      <MemoryRouter>
        <SupportRegionView regionCode="48820" />
      </MemoryRouter>,
    );

    // 제목은 새 지역인데 목록만 옛 지역이면 사용자는 그걸 이 지역 제도로 읽는다
    expect(screen.queryByText("화천 반값여행")).toBeNull();
    expect(screen.queryByRole("button", { name: /화천 반값여행/ })).toBeNull();
    // 계산기도 직전 지역 목록으로 열려 있으면 안 된다 — 엉뚱한 지역 기준으로 계산된다
    expect(screen.queryByText("예상 환급 계산")).toBeNull();

    resolve([item(2, "고성 반값여행")]);
    await screen.findByText("고성 반값여행");
    expect(screen.getByText("예상 환급 계산")).toBeTruthy();
  });

  it("전환 중에는 직전 목록 길이만큼 자리를 잡아 높이가 튀지 않는다", async () => {
    mockedList.mockResolvedValueOnce([item(1, "가"), item(2, "나"), item(3, "다")]);
    const { rerender, container } = renderAt("51790");

    await screen.findByText("다");

    mockedList.mockReturnValueOnce(new Promise<SupportListItem[]>(() => {}));
    rerender(
      <MemoryRouter>
        <SupportRegionView regionCode="48820" />
      </MemoryRouter>,
    );

    // 내용 없는 자리표를 직전 개수만큼. 첫 로드가 아니므로 '불러오는 중' 문구는 안 쓴다
    const placeholder = container.querySelector("ul[aria-hidden]");
    expect(placeholder).toBeTruthy();
    expect(placeholder!.children.length).toBe(3);
    expect(screen.queryByText("불러오는 중…")).toBeNull();
    // 자리표는 눈으로만 읽히므로, 듣는 쪽에는 따로 알려야 한다
    expect(screen.getByRole("status").textContent).toBe("지원 제도를 불러오는 중이에요.");
  });

  it("첫 로드에는 자리표 대신 문구를 띄운다", async () => {
    mockedList.mockReturnValueOnce(new Promise<SupportListItem[]>(() => {}));
    const { container } = renderAt("51790");

    await waitFor(() => expect(screen.getByText("불러오는 중…")).toBeTruthy());
    expect(container.querySelector("ul[aria-hidden]")).toBeNull();
  });
});
