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
import { getRegions } from "../../map/coursesApi";
import type { SupportListItem } from "../support.types";

vi.mock("../supportApi", () => ({ fetchSupportList: vi.fn() }));
vi.mock("../../map/coursesApi", () => ({ getRegions: vi.fn() }));

const mockedList = vi.mocked(fetchSupportList);
const mockedRegions = vi.mocked(getRegions);

/** 코스를 보유한 지역 — 화천만 있고 고성은 없다 */
const COURSE_REGIONS = [
  { region_code: "51790", name: "화천군", sido: "강원특별자치도", is_population_drop: true },
];

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
  mockedRegions.mockResolvedValue(COURSE_REGIONS);
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

// 코스가 없는 지역으로 보내면 '조건에 맞는 코스가 없어요'만 뜨는 목록이 나오고,
// 그 화면의 지역 필터는 코스 보유 지역만 담고 있어 URL의 지역이 표시되지도 않는다.
describe("SupportRegionView — 코스 링크", () => {
  // 코스 보유 지역 목록은 모듈 캐시에 한 번만 담긴다(패널을 여닫을 때마다 요청이
  // 나가지 않게 하려는 것). 테스트마다 첫 조회 상황을 만들려면 모듈을 다시 불러야 한다 —
  // 그러지 않으면 앞 테스트가 채운 캐시 때문에 조회 실패 경로에 아예 닿지 못한다.
  let Fresh: typeof SupportRegionView;
  let regions: typeof getRegions;

  beforeEach(async () => {
    vi.resetModules();
    Fresh = (await import("./SupportRegionView")).SupportRegionView;
    regions = (await import("../../map/coursesApi")).getRegions;
    vi.mocked((await import("../supportApi")).fetchSupportList).mockResolvedValue([]);
  });

  const renderFresh = (regionCode: string) =>
    render(
      <MemoryRouter>
        <Fresh regionCode={regionCode} />
      </MemoryRouter>,
    );

  const courseLink = () => screen.queryByRole("link", { name: /코스 보러가기/ });
  const offNotice = () => screen.queryByText("이 지역에는 등록된 코스가 없어요");

  it("코스가 있는 지역은 코스 링크를 보여준다", async () => {
    vi.mocked(regions).mockResolvedValue(COURSE_REGIONS);

    renderFresh("51790");

    await waitFor(() => expect(courseLink()!.getAttribute("href")).toBe("/courses?region=51790"));
    expect(regions).toHaveBeenCalledWith("도보");
    expect(offNotice()).toBeNull();
  });

  it("코스가 없는 지역은 링크 대신 비활성 안내를 보여준다", async () => {
    vi.mocked(regions).mockResolvedValue(COURSE_REGIONS); // 고성(48820)은 목록에 없다

    renderFresh("48820");

    // 누를 것이 아니라 알리는 문구다. disabled 버튼이면 Tab 순서에서 빠져
    // 키보드로 패널을 훑는 사람이 이 문구를 만나지 못한다.
    const off = await screen.findByText("이 지역에는 등록된 코스가 없어요");
    expect(off.tagName).toBe("P");
    expect(screen.queryByRole("button", { name: /등록된 코스가 없어요/ })).toBeNull();
    expect(courseLink()).toBeNull();
  });

  it("코스 보유 지역을 못 받으면 링크를 막지 않는다", async () => {
    // 모르는 것을 없다고 단정하지 않는다 — 코스가 있는 지역의 링크를 조회 실패로
    // 막아 버리는 쪽이, 빈 목록을 한 번 보여주는 것보다 나쁘다.
    vi.mocked(regions).mockRejectedValue(new TypeError("Failed to fetch"));

    renderFresh("48820");

    await screen.findByText("이 지역에 해당하는 지원 제도가 없어요.");
    expect(courseLink()).toBeTruthy();
    expect(offNotice()).toBeNull();
  });
});
