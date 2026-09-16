// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import SidebarDrawer from "./SidebarDrawer";

afterEach(cleanup);

it("배경의 포커스를 Tab과 Shift+Tab으로 드로어 안에 가져온다", () => {
  render(<MemoryRouter><button>배경</button><SidebarDrawer isOpen onClose={() => {}} /></MemoryRouter>);
  const close = screen.getByRole("button", { name: "닫기" });
  for (const shiftKey of [false, true]) {
    screen.getByRole("button", { name: "배경" }).focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey });
    expect(document.activeElement).toBe(close);
  }
});

it("모달에 의해 비활성화됐다가 활성화되면 닫기 버튼으로 포커스를 옮긴다", () => {
  const drawer = (inert: boolean) => <MemoryRouter><SidebarDrawer isOpen inert={inert} onClose={() => {}} /></MemoryRouter>;
  const { rerender } = render(drawer(true));
  const close = screen.getByRole("button", { name: "닫기" });
  expect(document.activeElement).not.toBe(close);
  rerender(drawer(false));
  expect(document.activeElement).toBe(close);
});

it("언마운트할 때 사라진 요소에 포커스를 복귀하지 않는다", () => {
  const previous = document.createElement("button");
  document.body.append(previous);
  previous.focus();
  const { unmount } = render(<MemoryRouter><SidebarDrawer isOpen onClose={() => {}} /></MemoryRouter>);
  previous.remove();
  const focus = vi.spyOn(previous, "focus");
  unmount();
  expect(focus).not.toHaveBeenCalled();
});
