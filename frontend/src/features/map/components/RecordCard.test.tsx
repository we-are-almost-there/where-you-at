// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordCard } from "./RecordCard";
import { StrictMode } from "react";
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
  vi.mocked(draw).mockReset().mockReturnValue(true);
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

function editFont() {
  fireEvent.click(screen.getByRole("button", { name: "글꼴" }));
  fireEvent.click(screen.getByRole("button", { name: "Do Hyeon" }));
}

it.each(["그리기 실패", "그리기 예외", "이미지 변환 실패", "이미지 변환 예외"])("%s 후 편집 없이 재시도하며 저장 전까지 보호한다", async (failure) => {
  mount();
  await screen.findByRole("button", { name: "이미지 저장" });
  if (failure === "그리기 실패") vi.mocked(draw).mockReturnValueOnce(false);
  else if (failure === "그리기 예외") vi.mocked(draw).mockImplementationOnce(() => { throw new Error("그리기 실패"); });
  else if (failure === "이미지 변환 실패") vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => callback(null));
  else vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce(() => { throw new Error("변환 실패"); });
  editFont();
  const retry = await screen.findByRole("button", { name: "다시 시도" });
  expect((retry as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByRole("alert").textContent).toContain("다시 시도해 주세요");
  expect(unloadAllowed()).toBe(false);
  const edited = vi.mocked(draw).mock.lastCall?.[1];
  fireEvent.click(retry);
  expect((screen.getByRole("button", { name: "이미지 준비 중…" }) as HTMLButtonElement).disabled).toBe(true);
  await screen.findByRole("button", { name: "이미지 저장" });
  expect(vi.mocked(draw).mock.lastCall?.[1]).toEqual(edited);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(unloadAllowed()).toBe(false);
  expect(share).not.toHaveBeenCalled();
  share.mockResolvedValue(undefined);
  await save();
  expect(unloadAllowed()).toBe(true);
});

it("초기 생성의 반복 실패를 재시도해도 사용자 편집으로 처리하지 않는다", async () => {
  vi.mocked(draw).mockReturnValueOnce(false).mockReturnValueOnce(false);
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
  await screen.findByRole("button", { name: "이미지 저장" });
  expect(unloadAllowed()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /^닫기$/ }));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  expect(share).not.toHaveBeenCalled();
});

it("편집·저장·재편집에 맞춰 페이지 이동 보호 상태를 전달한다", async () => {
  const onProtectionChange = vi.fn();
  render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={() => {}} onProtectionChange={onProtectionChange} />);
  expect(onProtectionChange).toHaveBeenLastCalledWith(false);
  editFont();
  expect(onProtectionChange).toHaveBeenLastCalledWith(true);
  share.mockResolvedValue(undefined);
  await save();
  expect(onProtectionChange).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole("button", { name: "Pretendard" }));
  expect(onProtectionChange).toHaveBeenLastCalledWith(true);
});

it("페이지 이동 확인은 나가기 문구를 표시하고 카드 닫기 대신 이동 처리를 호출한다", () => {
  const onClose = vi.fn();
  const onConfirmNavigation = vi.fn();
  render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={onClose} navigationBlocked
    onConfirmNavigation={onConfirmNavigation} />);
  expect(screen.getByRole("alertdialog", { name: "저장하지 않은 편집 내용이 있어요.",
    description: "지금 나가면 편집한 내용이 사라져요." })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "저장하지 않고 나가기" }));
  expect(onConfirmNavigation).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
});

it("초기 카드와 도구 전환·같은 값 선택은 StrictMode에서도 이탈을 막지 않는다", () => {
  render(<StrictMode><RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={() => {}} /></StrictMode>);
  expect(unloadAllowed()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "글꼴" }));
  fireEvent.click(screen.getByRole("button", { name: "Pretendard" }));
  expect(unloadAllowed()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /^닫기$/ }));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
});

it("저장 전 이탈을 보호하고 공유 성공 후 해제한다", async () => {
  mount();
  editFont();
  expect(unloadAllowed()).toBe(false);
  share.mockResolvedValue(undefined);
  await save();
  expect(unloadAllowed()).toBe(true);
});

it("공유를 취소하면 보호를 유지하고 언마운트 시 리스너를 정리한다", async () => {
  const view = mount();
  editFont();
  share.mockRejectedValue(new DOMException("cancel", "AbortError"));
  await save();
  expect(unloadAllowed()).toBe(false);
  view.unmount();
  expect(unloadAllowed()).toBe(true);
});

it("다운로드를 전달하면 보호를 해제한다", async () => {
  mount();
  editFont();
  share.mockRejectedValue(new Error("unsupported"));
  vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await save();
  expect(unloadAllowed()).toBe(true);
});

it("다운로드에 실패하면 보호를 유지한다", async () => {
  mount();
  editFont();
  share.mockRejectedValue(new Error("unsupported"));
  vi.stubGlobal("URL", { createObjectURL: () => { throw new Error("failed"); } });
  await save();
  expect(unloadAllowed()).toBe(false);
});

it("저장 후 내용을 편집하면 다시 보호한다", async () => {
  mount();
  share.mockResolvedValue(undefined);
  await save();
  expect(unloadAllowed()).toBe(true);
  editFont();
  expect(unloadAllowed()).toBe(false);
});

it("공유 중 내용이 바뀌면 이전 내용 저장이 끝나도 보호한다", async () => {
  let complete!: () => void;
  share.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
  mount();
  await save();
  editFont();
  await act(async () => { complete(); });
  expect(unloadAllowed()).toBe(false);
});

it("미저장 카드 닫기를 취소하면 편집과 이탈 보호를 유지한다", () => {
  const onClose = vi.fn();
  mount(onClose);
  editFont();
  fireEvent.click(screen.getByRole("button", { name: /^닫기$/ }));
  expect(screen.getByRole("alertdialog", {
    name: "저장하지 않은 기록 카드예요.",
    description: "지금 닫으면 이 기록 카드는 사라져요.",
  })).toBeTruthy();
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

it.each(["계속 편집", "Escape", "cancel"])("%s로 취소하면 모달을 닫은 뒤 카드 버튼으로 초점을 돌린다", (method) => {
  const onClose = vi.fn();
  mount(onClose);
  editFont();
  fireEvent.click(screen.getByRole("button", { name: /^닫기$/ }));
  const dialog = screen.getByRole("alertdialog") as HTMLDialogElement;
  const closeButton = screen.getByRole("button", { name: /^닫기$/ });
  const focus = closeButton.focus.bind(closeButton);
  // jsdom은 모달 바깥의 초점을 막지 않으므로, 복귀 시 모달이 닫혔는지도 검증한다.
  const focusSpy = vi.spyOn(closeButton, "focus").mockImplementation(() => {
    expect(dialog.open).toBe(false);
    focus();
  });
  if (method === "계속 편집") fireEvent.click(screen.getByRole("button", { name: "계속 편집" }));
  else if (method === "Escape") fireEvent.keyDown(screen.getByRole("button", { name: "계속 편집" }), { key: "Escape" });
  else fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(focusSpy).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(closeButton);
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
