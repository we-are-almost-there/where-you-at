// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordCard } from "./RecordCard";

vi.mock("../recordCardCanvas", async (importOriginal) => ({
  ...await importOriginal<typeof import("../recordCardCanvas")>(),
  draw: vi.fn(() => true),
}));

const unloadAllowed = () => window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
const share = vi.fn();
const dialogMethods = ["showModal", "close"] as const;
const originalDialogMethods = dialogMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
);

beforeEach(() => {
  share.mockReset();
  // jsdom에 없는 대화상자 메서드는 직접 정의해 열림 상태만 재현한다.
  for (const name of dialogMethods) {
    Object.defineProperty(HTMLDialogElement.prototype, name, {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement) { this.open = name === "showModal"; },
    });
  }
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"])));
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
});

afterEach(() => {
  cleanup();
  dialogMethods.forEach((name, index) => {
    const original = originalDialogMethods[index];
    if (original) Object.defineProperty(HTMLDialogElement.prototype, name, original);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "canShare");
  Reflect.deleteProperty(navigator, "share");
});

function mount(onClose = () => {}) {
  return render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={onClose} />);
}

async function save() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "이미지 저장" })); });
}

it("저장 전 이탈을 보호하고 공유 성공 후 해제한다", async () => {
  mount();
  expect(unloadAllowed()).toBe(false);
  share.mockResolvedValue(undefined);
  await save();
  expect(unloadAllowed()).toBe(true);
});

it("공유를 취소하면 보호를 유지하고 언마운트 시 리스너를 정리한다", async () => {
  const view = mount();
  share.mockRejectedValue(new DOMException("cancel", "AbortError"));
  await save();
  expect(unloadAllowed()).toBe(false);
  view.unmount();
  expect(unloadAllowed()).toBe(true);
});

it("다운로드를 전달하면 보호를 해제한다", async () => {
  mount();
  share.mockRejectedValue(new Error("unsupported"));
  vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await save();
  expect(unloadAllowed()).toBe(true);
});

it("다운로드에 실패하면 보호를 유지한다", async () => {
  mount();
  share.mockRejectedValue(new Error("unsupported"));
  vi.stubGlobal("URL", { createObjectURL: () => { throw new Error("failed"); } });
  await save();
  expect(unloadAllowed()).toBe(false);
});

it("저장 후 내용을 편집하면 다시 보호한다", async () => {
  const view = mount();
  share.mockResolvedValue(undefined);
  await save();
  expect(unloadAllowed()).toBe(true);
  view.rerender(<RecordCard record={{ distanceKm: 4, durationMs: 60000, paceSecPerKm: 15 }}
    routeType="도보" routePoints={[]} onClose={() => {}} />);
  expect(unloadAllowed()).toBe(false);
});

it("공유 중 내용이 바뀌면 이전 내용 저장이 끝나도 보호한다", async () => {
  let complete!: () => void;
  share.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
  const view = mount();
  await save();
  view.rerender(<RecordCard record={{ distanceKm: 4, durationMs: 60000, paceSecPerKm: 15 }}
    routeType="도보" routePoints={[]} onClose={() => {}} />);
  await act(async () => { complete(); });
  expect(unloadAllowed()).toBe(false);
});

it("미저장 카드 닫기를 취소하면 편집과 이탈 보호를 유지한다", () => {
  const onClose = vi.fn();
  mount(onClose);
  fireEvent.click(screen.getByRole("button", { name: /^닫기$/ }));
  expect(screen.getByRole("dialog", { name: "저장하지 않은 변경 내용이 있어요." })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "계속 편집" }));
  fireEvent.click(screen.getByRole("button", { name: "계속 편집" }));
  expect(onClose).not.toHaveBeenCalled();
  expect(unloadAllowed()).toBe(false);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /^닫기$/ }));
});

it("저장하지 않고 닫기를 선택할 때만 부모의 카드 정리를 실행한다", () => {
  const onClose = vi.fn();
  mount(onClose);
  fireEvent.click(screen.getByRole("button", { name: /^닫기$/ }));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "저장하지 않고 닫기" }));
  expect(onClose).toHaveBeenCalledOnce();
});

it("저장한 카드는 확인 없이 닫는다", async () => {
  const onClose = vi.fn();
  mount(onClose);
  share.mockResolvedValue(undefined);
  await save();
  fireEvent.click(screen.getByRole("button", { name: /^닫기$/ }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(screen.queryByText("저장하지 않은 변경 내용이 있어요.")).toBeNull();
});

it("확인창에서 Escape를 누르면 카드로 돌아간다", () => {
  const onClose = vi.fn();
  mount(onClose);
  fireEvent.click(screen.getByRole("button", { name: /^닫기$/ }));
  fireEvent.keyDown(screen.getByRole("button", { name: "계속 편집" }), { key: "Escape" });
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByText("저장하지 않은 변경 내용이 있어요.")).toBeNull();
  expect(unloadAllowed()).toBe(false);
});
