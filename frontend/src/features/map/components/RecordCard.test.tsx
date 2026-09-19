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

beforeEach(() => {
  share.mockReset();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"])));
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "canShare");
  Reflect.deleteProperty(navigator, "share");
});

function mount() {
  return render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={() => {}} />);
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
