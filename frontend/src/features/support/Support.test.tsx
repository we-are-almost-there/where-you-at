// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { Support } from "./Support";

vi.mock("../../components/layout/AppHeader", () => ({ default: () => <header /> }));
vi.mock("../../components/layout/Footer", () => ({
  default: () => <footer data-testid="footer" />,
}));
vi.mock("./components/SeaBackdrop", () => ({
  SeaBackdrop: () => <div data-testid="sea-backdrop" />,
}));
vi.mock("./components/SupportRegionMap", () => ({ SupportRegionMap: () => <div /> }));
vi.mock("./components/SupportRegionView", () => ({ SupportRegionView: () => <div /> }));
vi.mock("./components/SupportDetail", () => ({ SupportDetail: () => <div /> }));

afterEach(cleanup);

it("바다 배경을 지원금 영역 안에서만 고정하고 푸터는 그 영역 밖에 둔다", () => {
  const { container } = render(
    <MemoryRouter initialEntries={["/support"]}>
      <Support />
    </MemoryRouter>,
  );

  const page = container.firstElementChild as HTMLElement;
  const content = page.children[1] as HTMLElement;
  const stickyBackdrop = screen.getByTestId("sea-backdrop").parentElement;
  const backdropLayer = stickyBackdrop?.parentElement;
  const footer = screen.getByTestId("footer");

  expect(page.classList.contains("min-h-dvh")).toBe(true);
  expect(content.classList.contains("overflow-clip")).toBe(true);
  expect(stickyBackdrop?.classList.contains("sticky")).toBe(true);
  expect(stickyBackdrop?.classList.contains("top-0")).toBe(true);
  expect(stickyBackdrop?.classList.contains("h-dvh")).toBe(true);
  expect(stickyBackdrop?.classList.contains("fixed")).toBe(false);
  expect(backdropLayer?.parentElement).toBe(content);
  expect(content.nextElementSibling).toBe(footer);
});
