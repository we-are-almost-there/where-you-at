// @vitest-environment jsdom
//
// 스탬프 지도가 전국(시도) → 시도(시군구)로 들어가고, 받은 스탬프를 구분해 보여 주며,
// 지도를 못 불러오면 다시 시도할 수 있는지 본다. 도형은 네모 두세 개로 만든 작은 파일로 대신한다.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HttpError } from "../../../lib/http";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Feature } from "geojson";
import StampMapDialog from "./StampMapDialog";

const square = (lng: number, lat: number, properties: Record<string, string>): Feature => ({
  type: "Feature",
  properties,
  geometry: {
    type: "Polygon",
    coordinates: [[[lng, lat], [lng + 0.5, lat], [lng + 0.5, lat + 0.5], [lng, lat + 0.5], [lng, lat]]],
  },
});

const SIDO = {
  type: "FeatureCollection",
  features: [square(127, 37.5, { sido_code: "11", sido_name: "서울특별시" }), square(128, 37.5, { sido_code: "51", sido_name: "강원특별자치도" })],
};
const SIGUNGU = {
  type: "FeatureCollection",
  features: [
    square(127, 37.5, { sgg_code: "11110", name: "종로구" }),
    square(128, 37.5, { sgg_code: "51130", name: "원주시" }),
    square(128.5, 37.5, { sgg_code: "51110", name: "춘천시" }),
  ],
};

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

const mapFetch = vi.fn((url: string) => Promise.resolve(okResponse(url.includes("sido") ? SIDO : SIGUNGU)));

beforeAll(() => {
  // jsdom에는 ResizeObserver가 없다. 이름표 크기 계산에만 쓰여 동작만 흉내 낸다.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StampMapDialog", () => {
  // 도형 파일은 모듈에 한 번만 받아 두므로, 실패 경우를 먼저 확인한다(실패는 캐시하지 않는다).
  it("지도를 못 불러오면 안내하고, 다시 시도하면 불러온다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<StampMapDialog stamps={[]} onClose={() => {}} />);

    expect((await screen.findByRole("alert")).textContent).toBe("지도를 불러오지 못했어요.");

    vi.stubGlobal("fetch", mapFetch);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("list", { name: "시도 목록" })).toBeTruthy();
  });

  it("시도를 고르면 그 시도의 시군구로 들어가고, 받은 시군구를 알려 준다", async () => {
    vi.stubGlobal("fetch", mapFetch);
    const onSelect = vi.fn();
    render(
      <StampMapDialog stamps={[{ sigunguCode: "51110", stampedAt: "2026-09-13" }]} onClose={() => {}} onSelectSigungu={onSelect} />,
    );

    // 전국: 받은 시군구가 있는 시도는 이름에 받음 표시가 붙는다.
    expect(await screen.findByRole("button", { name: "강원 (스탬프 받음)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "서울" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "강원 (스탬프 받음)" }));

    const list = screen.getByRole("list", { name: "강원특별자치도 시군구 목록" });
    expect(list.textContent).toContain("원주시");
    expect(list.textContent).not.toContain("종로구");
    // 사라진 시도 버튼 대신 뒤로가기로 초점을 옮긴다.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "전국으로" }));

    fireEvent.click(screen.getByRole("button", { name: "춘천시 (스탬프 받음)" }));
    expect(screen.getByText("2026.09.13에 스탬프를 찍었어요.")).toBeTruthy();
    expect(onSelect).toHaveBeenCalledWith({ code: "51110", name: "춘천시", sidoName: "강원특별자치도" });

    fireEvent.click(screen.getByRole("button", { name: "원주시" }));
    expect(screen.getByText("아직 완주하지 않아 스탬프를 찍을 수 없어요.")).toBeTruthy();
  });

  it("전국으로 돌아오면 시도 목록 첫 버튼으로 초점을 옮긴다", async () => {
    vi.stubGlobal("fetch", mapFetch);
    render(<StampMapDialog stamps={[]} onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "강원" }));
    fireEvent.click(screen.getByRole("button", { name: "전국으로" }));

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "서울" }));
  });

  it("AVAILABLE에만 찍기 버튼이 있고 요청 중 중복 클릭을 막는다", async () => {
    vi.stubGlobal("fetch", mapFetch);
    let resolve!: () => void;
    const onStamp = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const { rerender } = render(<StampMapDialog stamps={[]} statuses={[
      { sigunguCode: "51130", status: "AVAILABLE", stampedAt: null },
    ]} onStamp={onStamp} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "강원" }));
    fireEvent.click(screen.getByRole("button", { name: "춘천시" }));
    expect(screen.queryByRole("button", { name: "스탬프 찍기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "원주시" }));
    fireEvent.click(screen.getByRole("button", { name: "스탬프 찍기" }));
    const pendingButton = screen.getByRole("button", { name: "찍는 중…" }) as HTMLButtonElement;
    expect(pendingButton.disabled).toBe(true);
    fireEvent.click(pendingButton);
    expect(onStamp).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    rerender(<StampMapDialog stamps={[{ sigunguCode: "51130", stampedAt: "2026-09-21T00:00:00Z" }]}
      statuses={[{ sigunguCode: "51130", status: "STAMPED", stampedAt: "2026-09-21T00:00:00Z" }]}
      onStamp={onStamp} onClose={() => {}} />);
    expect(screen.getByText("2026.09.21에 스탬프를 찍었어요.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "스탬프 찍기" })).toBeNull();
  });

  it.each([409, 500])("찍기 오류 %s를 구분해 안내하고 재시도할 수 있다", async (status) => {
    vi.stubGlobal("fetch", mapFetch);
    const onStamp = vi.fn().mockRejectedValue(new HttpError(status, "failed"));
    render(<StampMapDialog stamps={[]} statuses={[{ sigunguCode: "51130", status: "AVAILABLE", stampedAt: null }]}
      onStamp={onStamp} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "강원" }));
    fireEvent.click(screen.getByRole("button", { name: "원주시" }));
    fireEvent.click(screen.getByRole("button", { name: "스탬프 찍기" }));
    expect((await screen.findByRole("alert")).textContent).toContain(status === 409 ? "완주 기록이 아직 없어요" : "연결을 확인");
    expect((screen.getByRole("button", { name: "스탬프 찍기" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
