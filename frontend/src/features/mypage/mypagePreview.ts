import type { RunRecord, SavedRecordCard, Stamp } from "./types";

// 화면 개발용 예시 데이터. 개발 서버에서 VITE_MYPAGE_PREVIEW=true일 때만 쓰인다 (mypageData.ts 참고).
// 기록·기록 카드·스탬프 API가 생기기 전에, 내용이 채워졌을 때와 페이지가 여러 장일 때의 배치를 확인하려고 둔다.
// 코스 이름과 수치는 지어낸 값이다. 코스 ID가 실제와 맞지 않아 상세로 이동하면 없는 코스일 수 있다.

const COURSES = [
  { courseId: 102, courseName: "(예시) 한강 뚝섬 걷기길", routeType: "도보", baseKm: 6.2, paceSec: 620 },
  { courseId: 101, courseName: "(예시) 의암호 순환 코스", routeType: "자전거", baseKm: 28.1, paceSec: 232 },
  { courseId: 104, courseName: "(예시) 해운대 달맞이길", routeType: "도보", baseKm: 4.0, paceSec: 575 },
  { courseId: 103, courseName: "(예시) 섬진강 따라 걷는 길", routeType: "도보", baseKm: 11.8, paceSec: 660 },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const LATEST = Date.parse("2026-09-16T07:40:00+09:00");

// 페이지 나눔을 볼 수 있게 한 페이지(10개)보다 많이 만든다.
export const previewRecords: RunRecord[] = Array.from({ length: 23 }, (_, i) => {
  const course = COURSES[i % COURSES.length];
  // 같은 코스라도 기록마다 조금씩 다르게
  const distanceKm = Math.round(course.baseKm * (1 + ((i * 7) % 5) / 100) * 100) / 100;
  const paceSecPerKm = course.paceSec * (1 - ((i * 3) % 7) / 100);
  return {
    id: i + 1,
    courseId: course.courseId,
    courseName: course.courseName,
    routeType: course.routeType,
    distanceKm,
    durationMs: Math.round(distanceKm * paceSecPerKm * 1000),
    paceSecPerKm,
    finishedAt: new Date(LATEST - i * 2.5 * DAY_MS).toISOString(),
    isCompleted: true,
  };
});

// 기록 세 개 중 두 개꼴로 카드를 만들었다고 본다.
export const previewRecordCards: SavedRecordCard[] = previewRecords
  .filter((_, i) => i % 3 !== 2)
  .map((record, i) => ({ id: i + 1, record, imageUrl: null, createdAt: record.finishedAt }));

export const previewStamps: Stamp[] = [
  { sigunguCode: "11215", stampedAt: "2026-09-16" }, // 서울 광진구
  { sigunguCode: "26350", stampedAt: "2026-09-06" }, // 부산 해운대구
  { sigunguCode: "51110", stampedAt: "2026-09-13" }, // 강원 춘천시
  { sigunguCode: "12730", stampedAt: "2026-09-03" }, // 전남광주 구례군
  { sigunguCode: "12330", stampedAt: "2026-08-29" }, // 전남광주 광산구
];
