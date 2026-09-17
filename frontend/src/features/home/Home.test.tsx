// @vitest-environment jsdom
//
// 홈 배너 캐러셀은 무한 루프처럼 보이려고 배너를 3벌 그린다.
// 키보드·화면낭독기에는 원본 한 벌만 보여야 한다(#139).
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import Home from "./Home";
import { BANNERS } from "./banners";

vi.mock("./homeApi", () => ({
  fetchFeaturedCourses: () => Promise.resolve([]),
  fetchNearbyCourses: () => Promise.resolve({ items: [], isFallback: false }),
  fetchUpcomingRaces: () => Promise.resolve([]),
}));
vi.mock("../../components/layout/AppHeader", () => ({ default: () => null }));
vi.mock("../../components/layout/Footer", () => ({ default: () => null }));

beforeAll(() => {
  // 캐러셀이 트랙을 가로로 옮길 때 쓰는 API. jsdom에는 없다.
  Element.prototype.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" && reduce,
    addEventListener() {},
    removeEventListener() {},
  }));
}

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

function bannerRegion() {
  return screen.getByRole("region", { name: "추천 소식" });
}

describe("Home 배너 캐러셀", () => {
  it("복제 배너는 접근성 트리와 Tab 순서에서 빠지고 원본 배너만 남는다", () => {
    renderHome();

    const allBannerLinks = bannerRegion().querySelectorAll("a[href]");
    expect(allBannerLinks).toHaveLength(BANNERS.length * 3);

    const exposed = within(bannerRegion()).getAllByRole("link");
    expect(exposed).toHaveLength(BANNERS.length);
    expect(exposed.every((link) => link.tabIndex === 0)).toBe(true);

    const clones = [...allBannerLinks].filter((link) => link.closest('[aria-hidden="true"]'));
    expect(clones).toHaveLength(BANNERS.length * 2);
    expect(clones.every((link) => (link as HTMLElement).tabIndex === -1)).toBe(true);
  });

  it("원본 슬라이드는 전체 중 몇 번째인지 알린다", () => {
    renderHome();

    const slides = within(bannerRegion()).getAllByRole("group");
    expect(slides.map((slide) => slide.getAttribute("aria-label"))).toEqual(
      BANNERS.map((_, i) => `${i + 1} / ${BANNERS.length}`),
    );
    expect(slides.every((slide) => slide.getAttribute("aria-roledescription") === "슬라이드")).toBe(true);
  });

  it("동작 줄이기 설정이면 자동 전환을 멈춘 채로 시작하고, 재생 버튼으로 켤 수 있다", () => {
    stubReducedMotion(true);
    vi.useFakeTimers();
    const scrollTo = vi.spyOn(Element.prototype, "scrollTo");
    renderHome();
    scrollTo.mockClear(); // 첫 위치 맞추기(가운데 벌)는 제외

    act(() => vi.advanceTimersByTime(20_000));
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "배너 자동 전환 재생" }));
    expect(screen.getByRole("button", { name: "배너 자동 전환 일시정지" })).toBeTruthy();
    act(() => vi.advanceTimersByTime(20_000));
    // 사용자가 켠 재생이라도 스크롤은 즉시 이동(auto)으로 한다.
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
    scrollTo.mockRestore();
  });

  it("설정이 없으면 자동 전환이 부드럽게 넘어간다", () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    const scrollTo = vi.spyOn(Element.prototype, "scrollTo");
    renderHome();
    scrollTo.mockClear();

    expect(screen.getByRole("button", { name: "배너 자동 전환 일시정지" })).toBeTruthy();
    act(() => vi.advanceTimersByTime(20_000));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
    scrollTo.mockRestore();
  });

  it("페이지 제목이 h1으로 한 번 있다", () => {
    renderHome();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("전체보기를 닫으면 연 버튼으로 초점을 돌려준다", () => {
    renderHome();
    const opener = screen.getByRole("button", { name: "배너 전체보기" });
    opener.focus();

    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "배너 전체보기" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "닫기" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
