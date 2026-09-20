import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRecord, fetchRecords, fetchRecordCards, saveRecordCard, ServerSaveUnconfirmedError } from "./recordsApi";
import { HttpError, NetworkError } from "../../lib/http";
import { RecordApiError } from "./recordsErrors";

const session = vi.hoisted(() => ({ token: "test-token" }));
vi.mock("../../lib/authToken", () => ({ readAccessToken: () => session.token }));
const fetchMock = vi.fn();
const dto = { id: 42, course_id: 7, course_name: "코스", route_type: "bicycle", distance_km: 3,
  duration_ms: 600000, pace_sec_per_km: 200, finished_at: "2026-09-20T01:02:03Z" };
const card = { id: 8, record: dto, image_url: "https://r2.test/view", created_at: dto.finished_at };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const image = () => new Blob(["png"], { type: "image/png" });
const upload = () => json({ upload_key: "uploads/7/key.png", upload_url: "https://r2.test/put" });
beforeEach(() => { session.token = "test-token"; fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

it.each([["도보", "trail"], ["자전거", "bicycle"]] as const)("%s 기록을 요청 형식으로 변환하고 생성 응답을 매핑한다", async (routeType, serverType) => {
  fetchMock.mockResolvedValue(json({ ...dto, route_type: serverType }, 201));
  const saved = await createRecord({ courseId: 7, routeType, distanceKm: 3, durationMs: 600000,
    paceSecPerKm: null, finishedAt: dto.finished_at });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ course_id: 7, route_type: serverType,
    distance_km: 3, duration_ms: 600000, pace_sec_per_km: null, finished_at: dto.finished_at });
  expect(saved).toMatchObject({ id: 42, courseId: 7, courseName: "코스", routeType, finishedAt: dto.finished_at });
});

it("목록 응답과 중첩 record 및 null 이미지 URL을 매핑한다", async () => {
  fetchMock.mockResolvedValueOnce(json({ total_count: 1, records: [dto] }))
    .mockResolvedValueOnce(json({ total_count: 25, page: 3, size: 12, cards: [{ ...card, image_url: null }] }));
  expect(await fetchRecords()).toEqual([expect.objectContaining({ id: 42, routeType: "자전거" })]);
  expect(await fetchRecordCards(3, 12)).toEqual({ totalCount: 25, page: 3, size: 12,
    cards: [expect.objectContaining({ imageUrl: null, record: expect.objectContaining({ id: 42 }) })] });
  expect(fetchMock.mock.calls[1][0]).toMatch(/\/api\/record-cards\?page=3&size=12$/);
});

it("인증 헤더 없이 PNG를 R2에 PUT한 뒤 upload_key를 record.id에 연결한다", async () => {
  fetchMock.mockResolvedValueOnce(upload()).mockResolvedValueOnce(new Response(null)).mockResolvedValueOnce(json(card, 201));
  const blob = image();
  expect(await saveRecordCard(42, blob)).toMatchObject({ id: 8, imageUrl: card.image_url, record: { id: 42 } });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ content_type: "image/png" });
  expect(fetchMock.mock.calls[1]).toEqual(["https://r2.test/put", { method: "PUT", headers: { "Content-Type": "image/png" }, body: blob }]);
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ record_id: 42, upload_key: "uploads/7/key.png" });
  expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer test-token");
});

it.each([0, 1])("업로드 %i단계 실패 시 카드 POST 전에 중단하고 재시도할 수 있다", async (stage) => {
  if (stage === 1) fetchMock.mockResolvedValueOnce(upload());
  fetchMock.mockResolvedValueOnce(json({}, 503));
  await expect(saveRecordCard(42, image())).rejects.toBeInstanceOf(HttpError);
  expect(fetchMock).toHaveBeenCalledTimes(stage + 1);
  fetchMock.mockResolvedValueOnce(upload()).mockResolvedValueOnce(new Response(null)).mockResolvedValueOnce(json(card, 201));
  await expect(saveRecordCard(42, image())).resolves.toMatchObject({ id: 8 });
});

it.each(["네트워크 오류", "500", "잘못된 JSON"])("최종 POST의 %s는 재시도할 수 없는 오류로 구분한다", async (failure) => {
  fetchMock.mockResolvedValueOnce(upload()).mockResolvedValueOnce(new Response(null));
  if (failure === "네트워크 오류") fetchMock.mockRejectedValueOnce(new TypeError("INSERT 후 응답 유실"));
  else fetchMock.mockResolvedValueOnce(failure === "500" ? json({}, 500) : new Response("bad JSON", { status: 201 }));
  await expect(saveRecordCard(42, image())).rejects.toBeInstanceOf(ServerSaveUnconfirmedError);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("R2 PUT 이후 사용자가 바뀌면 다른 사용자의 토큰으로 카드 POST를 보내지 않는다", async () => {
  fetchMock.mockResolvedValueOnce(upload()).mockImplementationOnce(async () => {
    session.token = "other-user";
    return new Response(null);
  });
  await expect(saveRecordCard(42, image())).rejects.toBeInstanceOf(ServerSaveUnconfirmedError);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("용량이나 형식 제한에 맞지 않는 이미지는 업로드 URL 요청 전에 거부한다", async () => {
  await expect(saveRecordCard(42, new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }))).rejects.toThrow();
  await expect(saveRecordCard(42, new Blob(["svg"], { type: "image/svg+xml" }))).rejects.toThrow();
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
  [503, "아직 제공하지 않는 기능입니다."],
  [422, [{ loc: ["body", "record_id"], msg: "입력 오류", type: "int_parsing" }]],
])("최종 카드 POST의 명확한 거절 응답 %s는 detail을 보존한다", async (status, detail) => {
  fetchMock.mockResolvedValueOnce(upload()).mockResolvedValueOnce(new Response(null))
    .mockResolvedValueOnce(json({ detail }, status as number));
  const error = await saveRecordCard(42, image()).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(RecordApiError);
  expect(error).not.toBeInstanceOf(ServerSaveUnconfirmedError);
  expect(error).toMatchObject({ status, detail });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it.each([json({ detail: "데이터베이스에 연결할 수 없습니다." }, 503), new Response("프록시 오류", { status: 503 })])(
  "최종 카드 POST의 일반 503은 명확한 기능 비활성화와 구분한다", async (response) => {
    fetchMock.mockResolvedValueOnce(upload()).mockResolvedValueOnce(new Response(null)).mockResolvedValueOnce(response);
    await expect(saveRecordCard(42, image())).rejects.toBeInstanceOf(ServerSaveUnconfirmedError);
  },
);
