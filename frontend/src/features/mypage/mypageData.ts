import { getSavedCourses, seedSavedKeys, type SavedCourse } from "../saved";
import { previewRecordCards, previewRecords, previewStamps } from "./mypagePreview";
import type { RunRecord, SavedRecordCard, Stamp } from "./types";

// 마이페이지의 찜·기록·기록 카드·스탬프 데이터.
// 찜은 서버에서 받아 오고, 기록·기록 카드·스탬프는 아직 서버 API가 없어 빈 목록을 돌려준다.
// 개발 서버에서 VITE_MYPAGE_PREVIEW=true면 예시 데이터로 채워 내용이 있을 때의 화면을 확인할 수 있다
// (고객지원의 VITE_HELP_MOCK과 같은 방식).
// API가 생기면 이 파일의 함수를 fetch로 바꾼다. 지금은 목록 전체를 받아 화면에서 페이지를 나누지만,
// 기록처럼 계속 늘어나는 목록은 서버에서 나눠 받는 편이 낫다(공지 목록의 page·per_page처럼).

// 개발 서버(DEV)에서만 켠다. 배포 환경변수에 실수로 들어가도 운영 화면에 지어낸 기록이 나오지 않게 한다.
const USE_PREVIEW = import.meta.env.DEV && import.meta.env.VITE_MYPAGE_PREVIEW === "true";

/**
 * 찜한 코스. 최근 찜한 순이며, 코스 탐색 카드를 그대로 쓰도록 코스 목록 응답 모양으로 받는다.
 * 받은 김에 하트 상태 저장소도 채워, 이 화면의 카드가 처음부터 찜한 상태로 그려지게 한다.
 */
export async function fetchSavedCourses(): Promise<SavedCourse[]> {
  const saved = await getSavedCourses();
  seedSavedKeys(saved.map((item) => ({ courseId: item.course.id, routeType: item.routeType })));
  return saved;
}

/** 완주 기록. 최근 완주순. */
export function getRecords(): RunRecord[] {
  return USE_PREVIEW ? previewRecords : [];
}

/** 저장한 기록 카드. 최근 만든 순. */
export function getRecordCards(): SavedRecordCard[] {
  return USE_PREVIEW ? previewRecordCards : [];
}

/** 받은 시군구 스탬프. */
export function getStamps(): Stamp[] {
  return USE_PREVIEW ? previewStamps : [];
}
