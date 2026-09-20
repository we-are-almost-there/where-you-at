import { getSavedCourses, type SavedCourse } from "../saved";
import { previewRecordCards, previewRecords, previewStamps } from "./mypagePreview";
import { createRecord, fetchRecordCards, fetchRecords, type CreateRecordInput } from "./recordsApi";
import type { RecordCardPage, RunRecord, SavedRecordCard, SigunguStampStatus } from "./types";
import { createStamp, fetchStamps } from "./stampsApi";

// 마이페이지의 찜·기록·기록 카드·스탬프 데이터.
// 찜·기록·기록 카드 목록은 서버에서 받아 온다.
// 스탬프 상태도 서버에서 조회하고, 찍기는 사용자가 직접 요청한다.
// 개발 서버에서 VITE_MYPAGE_PREVIEW=true면 예시 데이터로 채워
// 내용이 있을 때의 화면을 확인할 수 있다 (고객지원의 VITE_HELP_MOCK과 같은 방식).
// 완주 기록은 전체 목록을 받고, 기록 카드는 서버에서 한 페이지씩 받는다.

// 개발 서버(DEV)에서만 켠다. 배포 환경변수에 실수로 들어가도 운영 화면에 지어낸 기록이 나오지 않게 한다.
const USE_PREVIEW = import.meta.env.DEV && import.meta.env.VITE_MYPAGE_PREVIEW === "true";

/**
 * 찜한 코스. 최근 찜한 순이며, 코스 탐색 카드를 그대로 쓰도록 코스 목록 응답 모양으로 받는다.
 */
export async function fetchSavedCourses(): Promise<SavedCourse[]> {
  return getSavedCourses();
}

/** 내 완주 기록. 최근 완주순. */
export async function fetchMyRecords(): Promise<RunRecord[]> {
  if (USE_PREVIEW) return previewRecords;
  return fetchRecords();
}

/** 내가 저장한 기록 카드. 최근 만든 순. */
export async function fetchMyRecordCards(page = 1, size = 12): Promise<RecordCardPage> {
  if (USE_PREVIEW) return { totalCount: previewRecordCards.length, page, size,
    cards: previewRecordCards.slice((page - 1) * size, page * size) };
  return fetchRecordCards(page, size);
}

/** 완주 기록. 최근 완주순. (동기 버전 — 서버 연결 전 화면용. 화면을 useRecords로 옮기면 지운다.) */
export function getRecords(): RunRecord[] {
  return USE_PREVIEW ? previewRecords : [];
}

/** 저장한 기록 카드. 최근 만든 순. (동기 버전 — 위와 같다.) */
export function getRecordCards(): SavedRecordCard[] {
  return USE_PREVIEW ? previewRecordCards : [];
}

const previewStatuses: SigunguStampStatus[] = [
  ...previewStamps.map((stamp) => ({ ...stamp, status: "STAMPED" as const })),
  { sigunguCode: "51130", status: "AVAILABLE", stampedAt: null },
];

/** 스탬프 지도에 표시할 시군구 상태. */
export async function fetchMyStamps(): Promise<SigunguStampStatus[]> {
  return USE_PREVIEW ? previewStatuses.map((item) => ({ ...item })) : fetchStamps();
}

/** 미리보기에서도 직접 찍은 상태는 모달을 다시 열 때 유지한다. */
export async function stampMyRegion(code: string): Promise<SigunguStampStatus> {
  if (!USE_PREVIEW) return createStamp(code);
  const item = previewStatuses.find((stamp) => stamp.sigunguCode === code);
  if (!item || item.status === "LOCKED") throw new Error("Unavailable preview region");
  item.status = "STAMPED";
  item.stampedAt ??= new Date().toISOString();
  return { ...item };
}

/** 완주 저장은 개발용 미리보기와 무관하다. 비멱등 POST이므로 호출자가 재시도하지 않는다. */
export async function saveMyRecord(input: CreateRecordInput): Promise<RunRecord> {
  // 서버 duration_ms가 정수라 소수는 반올림한다.
  return createRecord({ ...input, durationMs: Math.round(input.durationMs) });
}
