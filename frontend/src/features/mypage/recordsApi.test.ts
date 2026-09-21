import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRecord, fetchRecords, fetchRecordCards, saveRecordCard, ServerSaveUnconfirmedError } from "./recordsApi";
import { NetworkError } from "../../lib/http";
import { RecordApiError, RecordImageValidationError } from "./recordsErrors";

const session = vi.hoisted(() => ({ token: "test-token" }));
vi.mock("../../lib/authToken", () => ({ readAccessToken: () => session.token }));
const fetchMock = vi.fn();
const dto = { id: 42, course_id: 7, course_name: "코스", route_type: "bicycle", distance_km: 3,
  duration_ms: 600000, pace_sec_per_km: 200, finished_at: "2026-09-20T01:02:03Z" };
const card = { id: 8, record: dto, image_url: "https://r2.test/view", created_at: dto.finished_at };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const image = () => new Blob(["png"], { type: "image/png" });
beforeEach(() => { session.token = "test-token"; fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

it.each([["도보", "trail"], ["자전거", "bicycle"]] as const)("%s 기록을 요청 형식으로 변환하고 생성 응답을 매핑한다", async (routeType, serverType) => {
  fetchMock.mockResolvedValue(json({ ...dto, route_type: serverType }, 201));
  const saved = await createRecord({ courseId: 7, routeType, distanceKm: 3, durationMs: 600000,
    paceSecPerKm: null, finishedAt: dto.finished_at });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ course_id: 7, route_type: serverType,
    distance_km: 3, duration_ms: 600000, pace_sec_per_km: null, finished_at: dto.finished_at, is_completed: false });
  expect(saved).toMatchObject({ id: 42, courseId: 7, courseName: "코스", routeType, finishedAt: dto.finished_at });
});

it("완주 판정을 서버에 전달한다", async () => {
  fetchMock.mockResolvedValue(json(dto, 201));
  await createRecord({ courseId: 7, routeType: "도보", distanceKm: 3, durationMs: 600000,
    paceSecPerKm: null, finishedAt: dto.finished_at, isCompleted: true });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).is_completed).toBe(true);
});

it("목록 응답과 중첩 record 및 null 이미지 URL을 매핑한다", async () => {
  fetchMock.mockResolvedValueOnce(json({ total_count: 1, records: [dto] }))
    .mockResolvedValueOnce(json({ total_count: 25, page: 3, size: 12, cards: [{ ...card, image_url: null }] }));
  expect(await fetchRecords()).toEqual([expect.objectContaining({ id: 42, routeType: "자전거" })]);
  expect(await fetchRecordCards(3, 12)).toEqual({ totalCount: 25, page: 3, size: 12,
    cards: [expect.objectContaining({ imageUrl: null, record: expect.objectContaining({ id: 42 }) })] });
  expect(fetchMock.mock.calls[1][0]).toMatch(/\/api\/record-cards\?page=3&size=12$/);
});

it.each(["image/png", "image/jpeg", "image/webp"])("%s 바이너리를 인증 헤더와 함께 API 서버에 한 번 보낸다", async (type) => {
  fetchMock.mockResolvedValueOnce(json(card, 201));
  const blob = new Blob(["image"], { type });
  expect(await saveRecordCard(42, blob)).toMatchObject({ id: 8, imageUrl: card.image_url, record: { id: 42 } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/record-cards\?record_id=42$/), {
    method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": type }, body: blob,
  });
});

it.each(["네트워크 오류", "500", "잘못된 JSON"])("최종 POST의 %s는 재시도할 수 없는 오류로 구분한다", async (failure) => {
  if (failure === "네트워크 오류") fetchMock.mockRejectedValueOnce(new TypeError("INSERT 후 응답 유실"));
  else fetchMock.mockResolvedValueOnce(failure === "500" ? json({}, 500) : new Response("bad JSON", { status: 201 }));
  await expect(saveRecordCard(42, image())).rejects.toBeInstanceOf(ServerSaveUnconfirmedError);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("저장 중 사용자가 바뀌면 이전 계정의 응답을 성공으로 처리하지 않는다", async () => {
  fetchMock.mockImplementationOnce(async () => {
    session.token = "other-user";
    return json(card, 201);
  });
  await expect(saveRecordCard(42, image())).rejects.toBeInstanceOf(ServerSaveUnconfirmedError);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-token");
});

it("빈 이미지나 용량·형식 제한에 맞지 않는 이미지는 요청 전에 거부한다", async () => {
  await expect(saveRecordCard(42, new Blob([], { type: "image/png" }))).rejects.toBeInstanceOf(RecordImageValidationError);
  await expect(saveRecordCard(42, new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }))).rejects.toBeInstanceOf(RecordImageValidationError);
  await expect(saveRecordCard(42, new Blob(["svg"], { type: "image/svg+xml" }))).rejects.toBeInstanceOf(RecordImageValidationError);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("네트워크 오류와 인증 오류를 호출자에게 전달한다", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(json({}, 401));
  await expect(fetchRecords()).rejects.toBeInstanceOf(NetworkError);
  await expect(fetchRecordCards()).rejects.toMatchObject({ status: 401 });
});

it.each([
  [409, "저장할 수 있는 기록 카드 수를 넘었어요."],
  [409, "업로드한 이미지가 바뀌었습니다. 다시 시도해 주세요."],
  [429, "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요."],
  [413, "기록 카드 이미지는 5MB 이하만 올릴 수 있습니다."],
  [503, "아직 제공하지 않는 기능입니다."],
  [422, [{ loc: ["body", "record_id"], msg: "입력 오류", type: "int_parsing" }]],
])("최종 카드 POST의 명확한 거절 응답 %s는 detail을 보존한다", async (status, detail) => {
  fetchMock.mockResolvedValueOnce(json({ detail }, status as number));
  const error = await saveRecordCard(42, image()).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(RecordApiError);
  expect(error).not.toBeInstanceOf(ServerSaveUnconfirmedError);
  expect(error).toMatchObject({ status, detail });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each([json({ detail: "데이터베이스에 연결할 수 없습니다." }, 503), new Response("프록시 오류", { status: 503 })])(
  "최종 카드 POST의 일반 503은 명확한 기능 비활성화와 구분한다", async (response) => {
    fetchMock.mockResolvedValueOnce(response);
    await expect(saveRecordCard(42, image())).rejects.toBeInstanceOf(ServerSaveUnconfirmedError);
  },
);
