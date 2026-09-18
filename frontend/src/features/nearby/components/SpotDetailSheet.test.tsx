// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NearbySpot } from "../types";
import { SpotDetailSheet } from "./SpotDetailSheet";

const api = vi.hoisted(() => ({
  getTourSpotDetail: vi.fn(),
  getBicycleFacilityDetail: vi.fn(),
}));

vi.mock("../nearbyApi", () => api);

const accommodation: NearbySpot = {
  id: "1",
  category: "accommodation",
  name: "테스트 숙소",
  address: "테스트 주소",
  image_url: "",
  lat: 37.5,
  lng: 127,
  distance_m: 100,
  duration_minutes: 2,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SpotDetailSheet 예약 링크", () => {
  it("HTTP(S) 예약 URL은 새 창 링크로 표시한다", async () => {
    api.getTourSpotDetail.mockResolvedValue({
      detail: { reservation_url: "https://example.com/reserve" },
    });

    render(<SpotDetailSheet spot={accommodation} onClose={vi.fn()} />);

    const link = await screen.findByRole("link", { name: "예약 페이지로 이동 (새 탭에서 열림)" });
    expect(link.getAttribute("href")).toBe("https://example.com/reserve");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("허용하지 않는 예약 URL은 링크로 표시하지 않는다", async () => {
    api.getTourSpotDetail.mockResolvedValue({
      detail: { reservation_url: "javascript:alert(1)" },
    });

    render(<SpotDetailSheet spot={accommodation} onClose={vi.fn()} />);

    expect(await screen.findByText("예약 링크 없음")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /예약 페이지로 이동/ })).toBeNull();
  });
});

describe("SpotDetailSheet 대화상자", () => {
  it("장소 이름을 제목으로 하는 비모달 대화상자로 열리고 닫기 버튼에 초점을 둔다", async () => {
    api.getTourSpotDetail.mockResolvedValue({ detail: {} });
    render(<SpotDetailSheet spot={accommodation} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "테스트 숙소" });
    // 지도 마커로 다른 장소를 계속 고를 수 있어 모달이 아니다.
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "닫기" }));
    await screen.findByText("예약 링크 없음");
  });

  it("Escape로 닫고, 닫히면 지정한 요소(장소 카드)로 초점을 돌려준다", async () => {
    api.getTourSpotDetail.mockResolvedValue({ detail: {} });
    const card = document.createElement("button");
    document.body.append(card);
    const onClose = vi.fn();
    const { unmount } = render(
      <SpotDetailSheet spot={accommodation} onClose={onClose} getReturnTarget={() => card} />,
    );
    await screen.findByText("예약 링크 없음");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(document.activeElement).toBe(card);
    card.remove();
  });

  it("container를 넘기면 그 요소 아래에 포털로 그린다", async () => {
    api.getTourSpotDetail.mockResolvedValue({ detail: {} });
    const panel = document.createElement("section");
    document.body.append(panel);

    render(<SpotDetailSheet spot={accommodation} onClose={vi.fn()} container={panel} />);

    expect(panel.contains(screen.getByRole("dialog"))).toBe(true);
    await screen.findByText("예약 링크 없음");
    panel.remove();
  });

  it("상세를 불러오는 동안 상태를 화면낭독기에 알린다", async () => {
    api.getTourSpotDetail.mockResolvedValue({ detail: {} });
    render(<SpotDetailSheet spot={accommodation} onClose={vi.fn()} />);

    expect(screen.getByRole("status").textContent).toBe("상세 정보를 불러오는 중");
    await screen.findByText("예약 링크 없음");
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
