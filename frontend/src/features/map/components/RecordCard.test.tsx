// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordCard } from "./RecordCard";
import { draw } from "../recordCardCanvas";

vi.mock("@fontsource/do-hyeon", () => ({}));
vi.mock("@fontsource/black-han-sans", () => ({}));

vi.mock("../recordCardCanvas", async (importOriginal) => ({
  ...await importOriginal<typeof import("../recordCardCanvas")>(),
  draw: vi.fn(() => true),
}));

const unloadAllowed = () => window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
const share = vi.fn();
const loadFonts = vi.fn();
const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
const dialogMethods = ["showModal", "close"] as const;
const originalDialogMethods = dialogMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
);

beforeEach(() => {
  share.mockReset();
  loadFonts.mockReset().mockResolvedValue([]);
  vi.mocked(draw).mockClear();
  Object.defineProperty(document, "fonts", { configurable: true, value: { load: loadFonts } });
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
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
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
  const button = await screen.findByRole("button", { name: "이미지 저장" });
  await act(async () => { fireEvent.click(button); });
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
  expect(screen.getByRole("dialog", { name: "저장하지 않은 기록 카드예요." })).toBeTruthy();
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
  expect(screen.queryByText("저장하지 않은 기록 카드예요.")).toBeNull();
});

it("확인창에서 Escape를 누르면 카드로 돌아간다", () => {
  const onClose = vi.fn();
  mount(onClose);
  fireEvent.click(screen.getByRole("button", { name: /^닫기$/ }));
  fireEvent.keyDown(screen.getByRole("button", { name: "계속 편집" }), { key: "Escape" });
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByText("저장하지 않은 기록 카드예요.")).toBeNull();
  expect(unloadAllowed()).toBe(false);
});

it("글꼴 로딩 중에는 이전 이미지를 저장하지 않고 최신 이미지 준비 후 보호를 해제한다", async () => {
  mount();
  share.mockResolvedValue(undefined);
  await save();
  expect(unloadAllowed()).toBe(true);
  let finishFonts!: () => void;
  loadFonts.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFonts = resolve; }));
  const oldDrawCount = vi.mocked(draw).mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "글꼴" }));
  fireEvent.click(screen.getByRole("button", { name: "Do Hyeon" }));
  const pendingButton = screen.getByRole("button", { name: "이미지 준비 중…" }) as HTMLButtonElement;
  expect(pendingButton.disabled).toBe(true);
  fireEvent.click(pendingButton);
  expect(share).toHaveBeenCalledTimes(1);
  expect(unloadAllowed()).toBe(false);
  await waitFor(() => expect(finishFonts).toBeTypeOf("function"));
  expect(vi.mocked(draw).mock.calls.length).toBe(oldDrawCount);
  await act(async () => { finishFonts(); });
  await save();
  expect(vi.mocked(draw).mock.lastCall?.[1].fontChoice).toBe("dohyeon");
  expect(share).toHaveBeenCalledTimes(2);
  expect(unloadAllowed()).toBe(true);
});

it("이전 편집본의 이미지 변환이 늦게 끝나도 최신 이미지를 덮어쓰지 않는다", async () => {
  const callbacks: BlobCallback[] = [];
  vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => { callbacks.push(callback); });
  mount();
  await waitFor(() => expect(callbacks).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "글꼴" }));
  fireEvent.click(screen.getByRole("button", { name: "Do Hyeon" }));
  await waitFor(() => expect(callbacks).toHaveLength(2));
  const latest = new Blob(["최신 이미지"]);
  await act(async () => { callbacks[1](latest); });
  await act(async () => { callbacks[0](new Blob(["이전 이미지"])); });
  const createObjectURL = vi.fn(() => "blob:test");
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  share.mockRejectedValue(new Error("공유 불가"));
  await save();
  expect(createObjectURL).toHaveBeenCalledWith(latest);
  expect(unloadAllowed()).toBe(true);
});
