// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import SidebarDrawer from "./SidebarDrawer";

afterEach(cleanup);

it("로그인 안내에서 나이 확인을 열고 취소하면 메뉴를 다시 활성화한다", () => {
  render(<MemoryRouter><SidebarDrawer isOpen onClose={() => {}} /></MemoryRouter>);
  expect(screen.getByText("로그인이 필요해요")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "카카오로 3초 만에 시작" }));
  expect(screen.queryByRole("dialog", { name: "메뉴" })).toBeNull();
  expect(screen.getByRole("dialog", { name: "만 14세 이상만 가입할 수 있어요" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(screen.getByRole("dialog", { name: "메뉴" })).toBeTruthy();
});

it("Escape는 드로어만 닫고 먼저 등록된 배경 팝업 핸들러로 전달하지 않는다", () => {
  const backgroundClose = vi.fn();
  const closeBackground = (event: KeyboardEvent) => {
    if (event.key === "Escape") backgroundClose();
  };
  document.addEventListener("keydown", closeBackground);
  try {
    const onClose = vi.fn();
    const drawer = (isOpen: boolean, inert = false) => (
      <MemoryRouter><SidebarDrawer isOpen={isOpen} inert={inert} onClose={onClose} /></MemoryRouter>
    );
    const { rerender, unmount } = render(drawer(true));
    const close = screen.getByRole("button", { name: "닫기" });
    expect(fireEvent.keyDown(close, { key: "Escape" })).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(backgroundClose).not.toHaveBeenCalled();

    rerender(drawer(true, true));
    fireEvent.keyDown(document, { key: "Escape" });
    rerender(drawer(false));
    fireEvent.keyDown(document, { key: "Escape" });
    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(backgroundClose).toHaveBeenCalledTimes(3);
  } finally {
    document.removeEventListener("keydown", closeBackground);
  }
});

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
  const close = screen.getByRole("button", { name: "닫기", hidden: true });
  expect(document.activeElement).not.toBe(close);
  rerender(drawer(false));
  expect(document.activeElement).toBe(close);
});

it("모달 의미를 제공하고 앱 전체를 잠갔다가 포커스를 복귀한다", () => {
  const root = document.createElement("div");
  root.id = "root";
  document.body.append(root);
  const drawer = (isOpen: boolean, inert = false) => (
    <MemoryRouter>
      <header><button>메뉴 열기</button></header>
      <main><button>본문</button></main>
      <SidebarDrawer isOpen={isOpen} inert={inert} onClose={() => {}} />
    </MemoryRouter>
  );
  try {
    const { rerender, unmount } = render(drawer(false), { container: root });
    const opener = screen.getByRole("button", { name: "메뉴 열기" });
    opener.focus();
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(drawer(true));
    const dialog = screen.getByRole("dialog", { name: "메뉴" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(root.hasAttribute("inert")).toBe(true);
    expect(root.contains(dialog)).toBe(false);
    rerender(drawer(true, true));
    expect(root.hasAttribute("inert")).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(drawer(true));
    expect(root.hasAttribute("inert")).toBe(true);
    rerender(drawer(false));
    expect(root.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener);
    rerender(drawer(true));
    unmount();
    expect(root.hasAttribute("inert")).toBe(false);
  } finally {
    root.remove();
  }
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
