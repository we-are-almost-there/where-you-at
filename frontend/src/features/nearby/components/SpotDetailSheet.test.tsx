// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

    const link = await screen.findByRole("link", { name: "예약 페이지로 이동" });
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
    expect(screen.queryByRole("link", { name: "예약 페이지로 이동" })).toBeNull();
  });
});
