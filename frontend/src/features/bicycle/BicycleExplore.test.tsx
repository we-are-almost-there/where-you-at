// @vitest-environment jsdom
//
// 자전거 대여소 '가까운 순'이 이용자 위치를 서버로 보내지 않고 전체를 받아 브라우저에서 정렬하는지,
// 그리고 받은 지 1분이 지난 전체 목록을 페이지 이동·탭 복귀 때 다시 받아 실시간 대여 가능 대수가
// 처음 값으로 남지 않는지 본다.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BicycleExplore } from "./BicycleExplore";
import {
  getAllBicycleFacilities,
  getBicycleFacilities,
  getBicycleRegions,
  getBicycleSubregions,
} from "./bicycleApi";
import type { BicycleFacility } from "./types";

vi.mock("./bicycleApi", () => ({
  getAllBicycleFacilities: vi.fn(),
  getBicycleFacilities: vi.fn(),
  getBicycleRegions: vi.fn(),
  getBicycleSubregions: vi.fn(),
}));
// 상단바는 브라우저 API를 써서 jsdom에서 그릴 수 없고, 이 테스트의 대상도 아니다.
vi.mock("../../components/layout/AppHeader", () => ({ default: () => null }));

const SEOUL = { latitude: 37.5665, longitude: 126.978 };

// 45개 → 20개씩 3페이지
const FACILITIES: BicycleFacility[] = Array.from({ length: 45 }, (_, i) => ({
  id: i + 1,
  facility_title: `대여소 ${i + 1}`,
  addr1: "",
  map_x: SEOUL.longitude,
  map_y: SEOUL.latitude + (i + 1) * 0.001,
  facility_type: "rental_unmanned",
  rental_fee_type: "",
  repair_available: null,
  open_hours: "",
  total_bikes: null,
  available_bikes: 3,
  region_code: "",
  realtime_synced_at: null,
}));

let now = 1_000_000;

function renderRealtime() {
  return render(
    <MemoryRouter initialEntries={["/bicycle-facilities?source=realtime"]}>
      <BicycleExplore />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  window.scrollTo = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: (onSuccess: PositionCallback) => onSuccess({ coords: SEOUL } as GeolocationPosition) },
  });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.mocked(getBicycleRegions).mockResolvedValue([]);
  vi.mocked(getBicycleSubregions).mockResolvedValue([]);
  vi.mocked(getBicycleFacilities).mockResolvedValue({ total_count: 45, page: 1, size: 20, facilities: FACILITIES.slice(0, 20) });
  vi.mocked(getAllBicycleFacilities).mockResolvedValue(FACILITIES);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "geolocation");
  Reflect.deleteProperty(document, "visibilityState");
});

const pageButton = (n: number) => screen.getByRole("button", { name: String(n) });

describe("BicycleExplore 가까운 순", () => {
  it("위치를 얻으면 전체를 한 번 받아 가까운 순으로 보여 주고, 요청에 좌표를 넣지 않는다", async () => {
    renderRealtime();

    await screen.findByText(/가까운 순/);
    expect(getAllBicycleFacilities).toHaveBeenCalledTimes(1);
    const query = vi.mocked(getAllBicycleFacilities).mock.calls[0][0];
    expect(query).not.toHaveProperty("lat");
    expect(query).not.toHaveProperty("lng");
    expect(query).not.toHaveProperty("sort");
  });

  it("받은 지 1분 안에는 페이지를 넘겨도 다시 받지 않고, 1분이 지나면 페이지를 넘길 때 다시 받는다", async () => {
    renderRealtime();
    await screen.findByText(/가까운 순/);

    now += 30_000;
    fireEvent.click(pageButton(2));
    await waitFor(() => expect(pageButton(2).getAttribute("aria-current")).toBe("page"));
    expect(getAllBicycleFacilities).toHaveBeenCalledTimes(1);

    now += 31_000; // 처음 받은 뒤 61초
    fireEvent.click(pageButton(3));
    await waitFor(() => expect(getAllBicycleFacilities).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(pageButton(3).getAttribute("aria-current")).toBe("page"));
  });

  it("갱신 요청이 실패해도 보던 목록을 유지하고, 다음 페이지 이동 때 다시 시도한다", async () => {
    vi.mocked(getAllBicycleFacilities)
      .mockResolvedValueOnce(FACILITIES)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(FACILITIES);
    renderRealtime();
    await screen.findByText(/가까운 순/);

    now += 61_000;
    fireEvent.click(pageButton(2));
    await waitFor(() => expect(getAllBicycleFacilities).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0)); // 실패 응답 처리

    expect(await screen.findByText("대여소 21")).toBeTruthy();
    expect(screen.queryByText("자전거 시설을 불러오지 못했어요")).toBeNull();

    fireEvent.click(pageButton(3));
    await waitFor(() => expect(getAllBicycleFacilities).toHaveBeenCalledTimes(3));
  });

  it("갱신이 끝나기 전에는 페이지를 연달아 넘겨도 전체를 겹쳐 받지 않는다", async () => {
    vi.mocked(getAllBicycleFacilities)
      .mockResolvedValueOnce(FACILITIES)
      .mockReturnValueOnce(new Promise(() => {})); // 끝나지 않는 느린 갱신
    renderRealtime();
    await screen.findByText(/가까운 순/);

    now += 61_000;
    fireEvent.click(pageButton(2));
    await waitFor(() => expect(getAllBicycleFacilities).toHaveBeenCalledTimes(2));

    fireEvent.click(pageButton(3));
    await waitFor(() => expect(pageButton(3).getAttribute("aria-current")).toBe("page"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(getAllBicycleFacilities).toHaveBeenCalledTimes(2);
  });

  it("다른 조건으로 새로 받는 중에는 이전 목록이 오래됐어도 페이지 이동으로 요청을 다시 시작하지 않는다", async () => {
    vi.mocked(getAllBicycleFacilities)
      .mockResolvedValueOnce(FACILITIES)
      .mockReturnValueOnce(new Promise(() => {})); // 탭을 바꿔 받는 느린 요청
    renderRealtime();
    await screen.findByText(/가까운 순/);

    now += 61_000;
    fireEvent.click(screen.getByRole("tab", { name: "운영 정보" }));
    await waitFor(() => expect(getAllBicycleFacilities).toHaveBeenCalledTimes(2));

    // 새 목록이 오기 전까지 화면에 남은 이전 목록에서 페이지를 넘긴다.
    fireEvent.click(pageButton(2));
    await waitFor(() => expect(pageButton(2).getAttribute("aria-current")).toBe("page"));
    expect(getAllBicycleFacilities).toHaveBeenCalledTimes(2);
  });

  // 위치 응답이 늦어 기본 순서 1페이지를 먼저 받은 뒤, 전체 목록이 오기 전에 페이지를 넘기는 경우.
  // 요청 page가 1로 고정돼 새 요청이 없으므로, 받아 둔 1페이지를 2페이지인 것처럼 보여 주면 안 된다.
  it("전체 목록이 오기 전에 페이지를 넘기면 이전 페이지 대신 로딩을 보여 주고, 도착하면 그 페이지를 보여 준다", async () => {
    let giveLocation: PositionCallback = () => {};
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (onSuccess: PositionCallback) => {
          giveLocation = onSuccess;
        },
      },
    });
    let resolveAll: (facilities: BicycleFacility[]) => void = () => {};
    vi.mocked(getAllBicycleFacilities).mockReturnValue(
      new Promise((resolve) => {
        resolveAll = resolve;
      }),
    );

    renderRealtime();
    await screen.findByText("대여소 1");

    act(() => giveLocation({ coords: SEOUL } as GeolocationPosition));
    await waitFor(() => expect(getAllBicycleFacilities).toHaveBeenCalledTimes(1));

    fireEvent.click(pageButton(2));
    expect(await screen.findByText("불러오는 중...")).toBeTruthy();
    expect(screen.queryByText("대여소 1")).toBeNull();

    await act(async () => resolveAll(FACILITIES));
    expect(await screen.findByText("대여소 21")).toBeTruthy();
    expect(screen.queryByText("대여소 1")).toBeNull();
    expect(getAllBicycleFacilities).toHaveBeenCalledTimes(1);
  });

  it("탭으로 돌아왔을 때 전체 목록이 1분보다 오래됐으면 다시 받는다", async () => {
    renderRealtime();
    await screen.findByText(/가까운 순/);

    now += 10_000;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(getAllBicycleFacilities).toHaveBeenCalledTimes(1);

    now += 60_000;
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(getAllBicycleFacilities).toHaveBeenCalledTimes(2));
  });
});
