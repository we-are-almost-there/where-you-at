// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordCard } from "./RecordCard";
import { StrictMode } from "react";
import { draw } from "../recordCardCanvas";
import { saveRecordCard, ServerSaveUnconfirmedError } from "../../mypage/recordsApi";
import { RecordApiError, RecordImageValidationError } from "../../mypage/recordsErrors";

vi.mock("@fontsource/do-hyeon", () => ({}));
vi.mock("@fontsource/black-han-sans", () => ({}));

vi.mock("../recordCardCanvas", async (importOriginal) => ({
  ...await importOriginal<typeof import("../recordCardCanvas")>(),
  draw: vi.fn(() => true),
}));

const unloadAllowed = () => window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
// 병렬 실행 시 글꼴 로딩·렌더링·이미지 변환 대기에 여유를 둔다.
const IMAGE_PREPARATION_TIMEOUT = 3000;
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
  const button = await screen.findByRole("button", { name: "이미지 저장" }, { timeout: IMAGE_PREPARATION_TIMEOUT });
  await act(async () => { fireEvent.click(button); });
}

function editFont() {
  fireEvent.click(screen.getByRole("button", { name: "글꼴" }));
  fireEvent.click(screen.getByRole("button", { name: "Do Hyeon" }));
}

it("용량 검증 실패는 원인을 안내하고 같은 이미지는 차단하되 편집 후에는 저장한다", async () => {
  const saveToServer = vi.fn().mockRejectedValueOnce(new RecordImageValidationError("5MB 이하 파일이어야 해요."))
    .mockResolvedValue(undefined);
  share.mockResolvedValue(undefined);
  render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={() => {}} saveToServer={saveToServer} />);
  await save();
  expect(screen.getByRole("alert").textContent).toContain("5MB");
  await save();
  expect(saveToServer).toHaveBeenCalledTimes(1);
  editFont();
  await save();
  expect(saveToServer).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each([
  [409, "저장할 수 있는 기록 카드 수를 넘었어요.", "기록 카드 수", 1],
  [409, "업로드한 이미지가 바뀌었습니다. 다시 시도해 주세요.", "이미지가 바뀌었어요", 2],
  [429, "요청이 너무 잦아요.", "잠시 후", 2],
  [503, "아직 제공하지 않는 기능입니다.", "아직 제공하지 않는 기능", 1],
  [422, [], "기기 시각", 1],
] as const)("카드 저장 거절 %s를 안내하고 허용된 경우에만 재시도한다", async (status, detail, message, attempts) => {
  const saveToServer = vi.fn().mockRejectedValue(new RecordApiError(status, detail));
  share.mockResolvedValue(undefined);
  render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={() => {}} saveToServer={saveToServer} />);
  await save();
  expect(screen.getByRole("alert").textContent).toContain(message);
  expect(screen.getByRole("alert").textContent).not.toContain("저장 여부");
  await save();
  expect(saveToServer).toHaveBeenCalledTimes(attempts);
  expect(share).toHaveBeenCalledTimes(2);
});

it("같은 편집 버전의 저장 버튼을 연속으로 눌러도 saveRecordCard와 최종 POST는 한 번만 실행한다", async () => {
  let finishPost!: (response: Response) => void;
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ upload_key: "uploads/7/card.png", upload_url: "https://r2.test/put" })))
    .mockResolvedValueOnce(new Response(null))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { finishPost = resolve; }));
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));
  const saveToServer = vi.fn((image: Blob) => saveRecordCard(42, image));
  share.mockResolvedValue(undefined);
  render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={() => {}} saveToServer={saveToServer} />);
  const button = await screen.findByRole("button", { name: "이미지 저장" }, { timeout: IMAGE_PREPARATION_TIMEOUT });
  // 같은 이벤트 배치에서 연속 클릭해 disabled 렌더링 전의 동기 잠금도 검증한다.
  await act(async () => { for (let i = 0; i < 10; i++) fireEvent.click(button); });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(saveToServer).toHaveBeenCalledTimes(1);
  expect((button as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finishPost(new Response(JSON.stringify({ id: 9, image_url: "https://r2.test/view",
    created_at: "2026-09-20T01:02:03Z", record: { id: 42, course_id: 1, course_name: "코스", route_type: "trail",
      distance_km: 3, duration_ms: 60000, pace_sec_per_km: 20, finished_at: "2026-09-20T01:02:03Z" } }), { status: 201 })));
  expect((button as HTMLButtonElement).disabled).toBe(false);
  // 서버 응답을 받은 뒤에도 같은 편집 버전이면 추가 카드를 만들지 않는다.
  await act(async () => { for (let i = 0; i < 10; i++) fireEvent.click(button); });
  expect(saveToServer).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith("/api/record-cards") && init.method === "POST")).toHaveLength(1);
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ record_id: 42, upload_key: "uploads/7/card.png" });
});

it("이미지 저장은 공유를 즉시 시작하고 지연된 서버 저장 중 이탈을 보호한다", async () => {
  let resolve!: () => void;
  const saveToServer = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
  const onProtectionChange = vi.fn();
  render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={() => {}} saveToServer={saveToServer} onProtectionChange={onProtectionChange} />);
  share.mockResolvedValue(undefined);
  await save();
  expect(share).toHaveBeenCalledTimes(1);
  expect(saveToServer).toHaveBeenCalledTimes(1);
  expect(unloadAllowed()).toBe(false);
  expect(onProtectionChange).toHaveBeenLastCalledWith(true);
  expect((screen.getByRole("button", { name: "이미지 저장" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => resolve());
  expect(unloadAllowed()).toBe(true);
  expect(onProtectionChange).toHaveBeenLastCalledWith(false);
  await save();
  expect(saveToServer).toHaveBeenCalledTimes(1);
});

it("카드 업로드 실패는 동일 편집 버전으로 재시도하고 편집 후에는 새 버전을 저장한다", async () => {
  const saveToServer = vi.fn().mockRejectedValueOnce(new Error("PUT failed")).mockResolvedValue(undefined);
  render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={() => {}} saveToServer={saveToServer} />);
  share.mockResolvedValue(undefined);
  await save();
  expect(screen.getByRole("alert").textContent).toContain("업로드에 실패");
  expect(unloadAllowed()).toBe(false);
  await save();
  expect(saveToServer).toHaveBeenCalledTimes(2);
  expect(unloadAllowed()).toBe(true);
  await save();
  expect(saveToServer).toHaveBeenCalledTimes(2);
  editFont();
  await save();
  expect(saveToServer).toHaveBeenCalledTimes(3);
  expect(saveToServer.mock.calls[0][0]).toBe(saveToServer.mock.calls[1][0]);
  expect(saveToServer.mock.calls[2][0]).not.toBe(saveToServer.mock.calls[1][0]);
});

it("서버 POST 결과가 불명확하면 이미지 저장을 다시 눌러도 서버 재전송은 하지 않는다", async () => {
  const saveToServer = vi.fn().mockRejectedValue(new ServerSaveUnconfirmedError("저장 여부를 확인하지 못했어요."));
  render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={() => {}} saveToServer={saveToServer} />);
  share.mockResolvedValue(undefined);
  await save();
  await save();
  expect(saveToServer).toHaveBeenCalledTimes(1);
  expect(share).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("alert").textContent).toContain("저장 여부");
  expect(unloadAllowed()).toBe(false);
});

it("업로드 중 새로 편집한 이미지는 이전 업로드 완료로 저장 처리하지 않는다", async () => {
  let resolve!: () => void;
  const saveToServer = vi.fn().mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }))
    .mockResolvedValue(undefined);
  render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={() => {}} saveToServer={saveToServer} />);
  share.mockResolvedValue(undefined);
  await save();
  editFont();
  await act(async () => resolve());
  expect(unloadAllowed()).toBe(false);
  await save();
  expect(saveToServer).toHaveBeenCalledTimes(2);
  expect(unloadAllowed()).toBe(true);
});

it("이전 공유가 늦게 완료돼도 더 최신 저장 버전을 덮어쓰지 않는다", async () => {
  let resolve!: () => void;
  const saveToServer = vi.fn().mockResolvedValue(undefined);
  share.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; })).mockResolvedValue(undefined);
  render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={() => {}} saveToServer={saveToServer} />);
  await save();
  editFont();
  await save();
  expect(unloadAllowed()).toBe(true);
  await act(async () => resolve());
  expect(unloadAllowed()).toBe(true);
  expect(saveToServer).toHaveBeenCalledTimes(2);
});

it("서버 저장을 기다리다 닫힌 카드의 완료 응답은 보호 콜백을 다시 호출하지 않는다", async () => {
  let resolve!: () => void;
  const saveToServer = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
  const onProtectionChange = vi.fn();
  const view = render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={() => {}} saveToServer={saveToServer} onProtectionChange={onProtectionChange} />);
  share.mockResolvedValue(undefined);
  await save();
  view.unmount();
  onProtectionChange.mockClear();
  await act(async () => resolve());
  expect(onProtectionChange).not.toHaveBeenCalled();
});

it.each(["그리기 실패", "그리기 예외", "이미지 변환 실패", "이미지 변환 예외"])("%s 후 편집 없이 재시도하며 저장 전까지 보호한다", async (failure) => {
  mount();
  await screen.findByRole("button", { name: "이미지 저장" }, { timeout: IMAGE_PREPARATION_TIMEOUT });
  if (failure === "그리기 실패") vi.mocked(draw).mockReturnValueOnce(false);
  else if (failure === "그리기 예외") vi.mocked(draw).mockImplementationOnce(() => { throw new Error("그리기 실패"); });
  else if (failure === "이미지 변환 실패") vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => callback(null));
  else vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce(() => { throw new Error("변환 실패"); });
  editFont();
  const retry = await screen.findByRole("button", { name: "다시 시도" }, { timeout: IMAGE_PREPARATION_TIMEOUT });
  expect((retry as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByRole("alert").textContent).toContain("다시 시도해 주세요");
  expect(unloadAllowed()).toBe(false);
  const edited = vi.mocked(draw).mock.lastCall?.[1];
  fireEvent.click(retry);
  expect((screen.getByRole("button", { name: "이미지 준비 중…" }) as HTMLButtonElement).disabled).toBe(true);
  await screen.findByRole("button", { name: "이미지 저장" }, { timeout: IMAGE_PREPARATION_TIMEOUT });
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
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }, { timeout: IMAGE_PREPARATION_TIMEOUT }));
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }, { timeout: IMAGE_PREPARATION_TIMEOUT }));
  await screen.findByRole("button", { name: "이미지 저장" }, { timeout: IMAGE_PREPARATION_TIMEOUT });
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

it("콜백만 교체해도 준비된 이미지와 저장 완료 상태를 유지한다", async () => {
  const record = { distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 };
  const routePoints: [] = [];
  const onClose = vi.fn();
  const first = vi.fn();
  const second = vi.fn();
  const third = vi.fn();
  const card = (callback: (protectedEdits: boolean) => void) => (
    <RecordCard record={record} routeType="도보" routePoints={routePoints}
      onClose={onClose} onProtectionChange={callback} />
  );
  const view = render(card(first));
  editFont();
  await screen.findByRole("button", { name: "이미지 저장" }, { timeout: IMAGE_PREPARATION_TIMEOUT });
  const drawCount = vi.mocked(draw).mock.calls.length;
  first.mockClear();
  view.rerender(card(second));
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenLastCalledWith(true);
  expect(vi.mocked(draw).mock.calls.length).toBe(drawCount);
  share.mockResolvedValue(undefined);
  await save();
  expect(share).toHaveBeenCalledOnce();
  expect(second).toHaveBeenLastCalledWith(false);
  view.rerender(card(third));
  expect(third).toHaveBeenLastCalledWith(false);
  expect(unloadAllowed()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /^닫기$/ }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alertdialog")).toBeNull();
  second.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Pretendard" }));
  expect(third).toHaveBeenLastCalledWith(true);
  expect(second).not.toHaveBeenCalled();
  view.unmount();
  expect(third).toHaveBeenLastCalledWith(false);
});

it("공유 중 콜백이 교체되면 새 콜백으로 저장 완료를 알린다", async () => {
  const record = { distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 };
  const routePoints: [] = [];
  const first = vi.fn();
  const second = vi.fn();
  let complete!: () => void;
  share.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
  const view = render(<RecordCard record={record} routePoints={routePoints} routeType="도보"
    onClose={() => {}} onProtectionChange={first} />);
  editFont();
  await save();
  first.mockClear();
  view.rerender(<RecordCard record={record} routePoints={routePoints} routeType="도보"
    onClose={() => {}} onProtectionChange={second} />);
  expect(second).toHaveBeenLastCalledWith(true);
  await act(async () => { complete(); });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenLastCalledWith(false);
  expect(unloadAllowed()).toBe(true);
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
  await waitFor(() => expect(finishFonts).toBeTypeOf("function"), { timeout: IMAGE_PREPARATION_TIMEOUT });
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
  await waitFor(() => expect(callbacks).toHaveLength(1), { timeout: IMAGE_PREPARATION_TIMEOUT });
  fireEvent.click(screen.getByRole("button", { name: "글꼴" }));
  fireEvent.click(screen.getByRole("button", { name: "Do Hyeon" }));
  await waitFor(() => expect(callbacks).toHaveLength(2), { timeout: IMAGE_PREPARATION_TIMEOUT });
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

it("공유 중 카드를 제거하면 뒤늦은 성공이 보호를 다시 켜지 않는다", async () => {
  const onProtectionChange = vi.fn();
  let complete!: () => void;
  share.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
  const view = render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={() => {}} onProtectionChange={onProtectionChange} />);
  editFont();
  await save();
  view.unmount();
  expect(onProtectionChange).toHaveBeenLastCalledWith(false);
  const calls = onProtectionChange.mock.calls.length;
  await act(async () => { complete(); });
  expect(onProtectionChange).toHaveBeenCalledTimes(calls);
  expect(onProtectionChange).toHaveBeenLastCalledWith(false);
});

it("공유 중 카드를 제거하면 뒤늦은 실패가 다운로드나 보호 알림을 일으키지 않는다", async () => {
  const onProtectionChange = vi.fn();
  let fail!: (error: Error) => void;
  share.mockImplementation(() => new Promise<void>((_, reject) => { fail = reject; }));
  const createObjectURL = vi.fn(() => "blob:test");
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const view = render(<RecordCard record={{ distanceKm: 3, durationMs: 60000, paceSecPerKm: 20 }}
    routeType="도보" routePoints={[]} onClose={() => {}} onProtectionChange={onProtectionChange} />);
  editFont();
  await save();
  view.unmount();
  const calls = onProtectionChange.mock.calls.length;
  await act(async () => { fail(new Error("공유 불가")); });
  expect(createObjectURL).not.toHaveBeenCalled();
  expect(click).not.toHaveBeenCalled();
  expect(onProtectionChange).toHaveBeenCalledTimes(calls);
});
