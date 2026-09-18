// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDialogFocus } from "./useDialogFocus";

function Dialog({ onEscape, getReturnTarget }: { onEscape: () => void; getReturnTarget?: () => HTMLElement | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus({ initialFocusRef: closeRef, containerRef, onEscape, getReturnTarget });
  return (
    <div ref={containerRef} role="dialog" aria-label="테스트 창">
      <button ref={closeRef}>닫기</button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function addButton(name: string) {
  const button = document.createElement("button");
  button.textContent = name;
  document.body.append(button);
  return button;
}

describe("useDialogFocus", () => {
  it("열리면 첫 초점 요소로 옮기고, 닫히면 연 요소로 돌려준다", () => {
    const opener = addButton("열기");
    opener.focus();

    const { unmount } = render(<Dialog onEscape={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "닫기" }));

    unmount();
    expect(document.activeElement).toBe(opener);
  });

  it("Escape로 닫기를 요청한다", () => {
    const onEscape = vi.fn();
    render(<Dialog onEscape={onEscape} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("위에 뜬 모달이 캡처 단계에서 먼저 처리한 Escape(preventDefault)는 무시한다", () => {
    const onEscape = vi.fn();
    render(<Dialog onEscape={onEscape} />);
    // 코스 이탈 안내창·사이드바처럼 나중에 떠서 맨 위에 있는 모달의 처리 방식
    const topModal = vi.fn((event: KeyboardEvent) => {
      if (event.key === "Escape") event.preventDefault();
    });
    document.addEventListener("keydown", topModal, true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(topModal).toHaveBeenCalledTimes(1);
    expect(onEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", topModal, true);
  });

  it("닫는 사이 사용자가 창 밖으로 초점을 옮겼으면 그 자리를 빼앗지 않는다", () => {
    const opener = addButton("열기");
    const elsewhere = addButton("다른 곳");
    opener.focus();
    const { unmount } = render(<Dialog onEscape={vi.fn()} />);

    elsewhere.focus();
    unmount();

    expect(document.activeElement).toBe(elsewhere);
  });

  it("getReturnTarget이 있으면 그 요소로 돌려주고, 사라진 요소에는 옮기지 않는다", () => {
    const opener = addButton("열기");
    const card = addButton("카드");
    opener.focus();

    const first = render(<Dialog onEscape={vi.fn()} getReturnTarget={() => card} />);
    first.unmount();
    expect(document.activeElement).toBe(card);

    const gone = addButton("사라질 버튼");
    opener.focus();
    const second = render(<Dialog onEscape={vi.fn()} getReturnTarget={() => gone} />);
    gone.remove();
    second.unmount();
    expect(document.activeElement).not.toBe(gone);
  });
});
