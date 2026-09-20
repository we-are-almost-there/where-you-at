import { getSavedCourses, type SavedCourse } from "../saved";
import { previewRecordCards, previewRecords, previewStamps } from "./mypagePreview";
import { createRecord, fetchRecordCards, fetchRecords, type CreateRecordInput } from "./recordsApi";
import type { RecordCardPage, RunRecord, SavedRecordCard, Stamp } from "./types";

// 마이페이지의 찜·기록·기록 카드·스탬프 데이터.
// 찜은 서버에서 받아 온다. 기록·기록 카드 목록은 VITE_MYPAGE_API=true일 때만 조회한다.
// 이 표시 플래그는 완주 기록 저장에는 적용하지 않는다.
// 서버 테이블(run_record, record_card)이 적용되기 전에 배포돼도 화면이 에러 대신 빈 목록을 보여 주게 하려는 것이다.
// 스탬프는 아직 서버 API가 없어 빈 목록을 돌려준다.
// 개발 서버에서 VITE_MYPAGE_PREVIEW=true면 예시 데이터로 채워
// 내용이 있을 때의 화면을 확인할 수 있다 (고객지원의 VITE_HELP_MOCK과 같은 방식).
// 완주 기록은 전체 목록을 받고, 기록 카드는 서버에서 한 페이지씩 받는다.

// 개발 서버(DEV)에서만 켠다. 배포 환경변수에 실수로 들어가도 운영 화면에 지어낸 기록이 나오지 않게 한다.
const USE_PREVIEW = import.meta.env.DEV && import.meta.env.VITE_MYPAGE_PREVIEW === "true";

// 서버 테이블이 준비된 환경에서만 켠다. 꺼져 있으면 기록·기록 카드는 빈 목록이다.
const USE_API = import.meta.env.VITE_MYPAGE_API === "true";

/**
 * 찜한 코스. 최근 찜한 순이며, 코스 탐색 카드를 그대로 쓰도록 코스 목록 응답 모양으로 받는다.
 */
export async function fetchSavedCourses(): Promise<SavedCourse[]> {
  return getSavedCourses();
}

/** 내 완주 기록. 최근 완주순. */
export async function fetchMyRecords(): Promise<RunRecord[]> {
  if (USE_PREVIEW) return previewRecords;
  return USE_API ? fetchRecords() : [];
}

/** 내가 저장한 기록 카드. 최근 만든 순. */
export async function fetchMyRecordCards(page = 1, size = 12): Promise<RecordCardPage> {
  if (USE_PREVIEW) return { totalCount: previewRecordCards.length, page, size,
    cards: previewRecordCards.slice((page - 1) * size, page * size) };
  return USE_API ? fetchRecordCards(page, size) : { totalCount: 0, page, size, cards: [] };
}

/** 완주 기록. 최근 완주순. (동기 버전 — 서버 연결 전 화면용. 화면을 useRecords로 옮기면 지운다.) */
export function getRecords(): RunRecord[] {
  return USE_PREVIEW ? previewRecords : [];
}

/** 저장한 기록 카드. 최근 만든 순. (동기 버전 — 위와 같다.) */
export function getRecordCards(): SavedRecordCard[] {
  return USE_PREVIEW ? previewRecordCards : [];
}

/** 받은 시군구 스탬프. */
export function getStamps(): Stamp[] {
  return USE_PREVIEW ? previewStamps : [];
}

/** 완주 저장은 마이페이지 목록의 표시 플래그와 무관하다. 비멱등 POST이므로 호출자가 재시도하지 않는다. */
export async function saveMyRecord(input: CreateRecordInput): Promise<RunRecord> {
  // 서버 duration_ms가 정수라 소수는 반올림한다.
  return createRecord({ ...input, durationMs: Math.round(input.durationMs) });
}
