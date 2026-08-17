// 홈 화면이 쓰는 데이터 조회.
// 각 도메인 API를 그대로 호출하고, 홈 카드가 쓰는 형태로만 바꿔 담는다.

import { fetchRaceList } from "../race/raceApi";
import { EVENT_TYPE_LABEL } from "../race/types";
import { getCourses } from "../map/coursesApi";
import type { Course, LatLng } from "../map/types";

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

/** 브라우저 현재 위치. 거부·실패·미지원이면 null */
function getCurrentPosition(): Promise<LatLng | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

/** 두 좌표 사이 대권 거리(km) */
function distanceKm(from: LatLng, to: LatLng): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** 단순화 경로는 sequence_order 순이라 첫 점이 곧 출발점이다 */
function startPoint(course: Course): LatLng | null {
  return course.path_trail[0] ?? course.path_bicycle[0] ?? null;
}

function toCourseItem(course: Course, origin: LatLng | null): CourseItem {
  // routes 순서는 보장되지 않고 자전거 경로엔 난이도가 없어 도보를 우선한다
  const route = course.routes.find((r) => r.route_type === "도보") ?? course.routes[0];
  const start = startPoint(course);

  return {
    id: course.id,
    name: course.title,
    region: course.start_address,
    lengthKm: route?.distance ?? 0,
    level: route?.difficulty ?? null,
    imageUrl: course.image_url || null,
    highlight: origin && start ? `${distanceKm(origin, start).toFixed(1)}km` : undefined,
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
export const FEATURED_REGIONS = [
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
      ...toCourseItem(course, null),
      // 카드에 지역명이 안 드러나서 썸네일 배지 자리(주변 코스에선 거리)를 지역명으로 쓴다
      highlight: region.label,
      // 빈 배열이면 카드가 관광지 줄을 비운 채 그리므로 아예 넘기지 않는다
      landmarks: course.landmarks.length > 0 ? course.landmarks : undefined,
    }));
}

/** 현재 위치에서 가까운 코스. 위치를 못 얻으면 기본 목록으로 폴백한다 */
export async function fetchNearbyCourses(limit = 4): Promise<NearbyCourses> {
  const origin = await getCurrentPosition();

  const query: Record<string, string> = { page: "1", size: String(limit) };
  if (origin) {
    query.sort = "nearest";
    query.lat = String(origin.lat);
    query.lng = String(origin.lng);
  }

  const { courses } = await getCourses(query);
  return {
    items: courses.map((course) => toCourseItem(course, origin)),
    isFallback: origin === null,
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
export async function fetchUpcomingRaces(limit = 3): Promise<UpcomingRace[]> {
  const races = await fetchRaceList({ per_page: limit });

  return races.map((race) => ({
    id: race.event_id,
    name: race.race_title,
    type: race.event_type ? EVENT_TYPE_LABEL[race.event_type] : null,
    startDate: race.start_date,
    location: race.location_name,
  }));
}
