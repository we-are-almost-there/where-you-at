// 홈 화면이 쓰는 데이터 조회.
// 각 도메인 API를 그대로 호출하고, 홈 카드가 쓰는 형태로만 바꿔 담는다.

import { fetchRacePage } from "../race/raceApi";
import { EVENT_TYPE_LABEL } from "../race/types";
import { getCourses, getCourseStarts } from "../map/coursesApi";
import { haversineKm } from "../map/courseSegments";
import { sortByDistance } from "../map/nearestSort";
import type { Course, CourseRoute, CourseStart, LatLng } from "../map/types";

export interface CourseItem {
  id: number;
  name: string;
  region: string;
  /** 코스 총 길이(km) */
  lengthKm: number;
  /** 난이도. 자전거 전용 경로는 없을 수 있다 */
  level: string | null;
  /** 카드 썸네일. 없으면 null */
  imageUrl?: string | null;
  /** 카드 메타 앞에 강조해 붙는 값 (내 위치에서의 거리 등) */
  highlight?: string;
  /** 코스 주변 대표 관광지. 있으면 지역명 대신 노출 */
  landmarks?: string[];
}

const POSITION_TIMEOUT_MS = 8000;

/** 브라우저 현재 위치. 거부·실패·미지원·무응답이면 null */
function getCurrentPosition(): Promise<LatLng | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);

  return new Promise((resolve) => {
    // geolocation의 timeout 옵션은 사용자가 권한 팝업에 "응답한 뒤"에야 시작한다.
    // 팝업을 그냥 방치하면 성공·실패 콜백이 둘 다 안 불려 영영 안 끝나므로
    // 바깥에서 따로 시간을 재서 폴백시킨다.
    const fallback = window.setTimeout(() => resolve(null), POSITION_TIMEOUT_MS);
    const settle = (position: LatLng | null) => {
      window.clearTimeout(fallback);
      resolve(position);
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => settle({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => settle(null),
      { timeout: POSITION_TIMEOUT_MS, maximumAge: 5 * 60 * 1000 },
    );
  });
}

/** routes 순서는 보장되지 않고 자전거 경로엔 난이도가 없어 도보를 우선한다 */
function mainRoute(routes: CourseRoute[]): CourseRoute | undefined {
  return routes.find((r) => r.route_type === "도보") ?? routes[0];
}

function toCourseItem(course: Course | CourseStart): CourseItem {
  const route = mainRoute(course.routes);
  return {
    id: course.id,
    name: course.title,
    region: course.start_address,
    lengthKm: route?.distance ?? 0,
    level: route?.difficulty ?? null,
    imageUrl: course.image_url || null,
  };
}

export interface NearbyCourses {
  items: CourseItem[];
  /** 위치를 못 얻어 '가까운 순'이 아닌 기본 목록으로 대체했는지 */
  isFallback: boolean;
}

/**
 * 유명 여행지 4곳. region 필터는 접두 매칭이라 시도(2자리)·시군구(5자리)를 모두 받는다.
 * 두루누비 코스가 해안 노선(해파랑길·남파랑길·서해랑길) 중심이라
 * 내륙 도시(대전·전주·가평)와 서울·제주는 코스가 없어 제외했다.
 */
const FEATURED_REGIONS = [
  { label: "부산", code: "26" },
  { label: "여수", code: "12130" },
  { label: "강릉", code: "51150" },
  { label: "경주", code: "47130" },
];

/**
 * 지역마다 코스 1개씩. 기본 정렬(c.id)이라 매번 같은 코스가 나온다.
 * 한 지역이 실패해도 나머지는 살리려고 요청별로 따로 잡는다.
 */
export async function fetchFeaturedCourses(): Promise<CourseItem[]> {
  const picked = await Promise.all(
    FEATURED_REGIONS.map((region) =>
      getCourses({ region: region.code, page: "1", size: "1" })
        .then(({ courses }) => (courses[0] ? { course: courses[0], region } : null))
        .catch(() => null),
    ),
  );

  return picked
    .filter((entry) => entry !== null)
    .map(({ course, region }) => ({
      ...toCourseItem(course),
      // 카드에 지역명이 안 드러나서 썸네일 배지 자리(주변 코스에선 거리)를 지역명으로 쓴다
      highlight: region.label,
      // 빈 배열이면 카드가 관광지 줄을 비운 채 그리므로 아예 넘기지 않는다
      landmarks: course.landmarks.length > 0 ? course.landmarks : undefined,
    }));
}

/**
 * 현재 위치에서 가까운 코스. 위치를 못 얻으면 기본 목록으로 폴백한다.
 *
 * 위치는 서버로 보내지 않는다. 도보 경로가 있는 모든 코스의 출발점 목록(위치와 상관없이 항상 같은 응답)을 받아
 * 브라우저에서 가까운 순으로 고른다. 가까운 코스만 다시 요청하지 않는 것도 같은 이유다(nearestSort.ts).
 */
export async function fetchNearbyCourses(limit = 4): Promise<NearbyCourses> {
  const origin = await getCurrentPosition();

  if (!origin) {
    const { courses } = await getCourses({ page: "1", size: String(limit) });
    return { items: courses.map(toCourseItem), isFallback: true };
  }

  const starts = await getCourseStarts();
  const nearest = sortByDistance(starts, origin, (course) => course.start).slice(0, limit);
  return {
    items: nearest.map((course) => ({
      ...toCourseItem(course),
      highlight: course.start ? `${haversineKm(origin, course.start).toFixed(1)}km` : undefined,
    })),
    isFallback: false,
  };
}

export interface UpcomingRace {
  id: number;
  name: string;
  /** 종목 라벨. event_type이 없으면 null이라 칩을 숨긴다 */
  type: string | null;
  /** "YYYY-MM-DD" */
  startDate: string;
  location: string | null;
}

/** 가까운 날짜순 대회. 백엔드가 upcoming_only + start_date ASC로 이미 걸러 준다 */
export async function fetchUpcomingRaces(limit = 3, signal?: AbortSignal): Promise<UpcomingRace[]> {
  const { items: races } = await fetchRacePage({ page: 1, per_page: limit, upcoming_only: true }, signal);

  return races.map((race) => ({
    id: race.event_id,
    name: race.race_title,
    type: race.event_type ? EVENT_TYPE_LABEL[race.event_type] : null,
    startDate: race.start_date,
    location: race.location_name,
  }));
}
