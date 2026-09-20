// 찜한 코스 API
// - 다른 API와 같이 사용자 문구로 바꾸지 않는다(lib/http). 화면 문구 변환은 컴포넌트가 한다.
// - 찜은 "코스 + 종목" 단위라 모든 요청이 courseId와 routeType을 함께 보낸다.
// - 종목은 API 경계에서만 영어(trail/bicycle)로 바꾼다(coursesApi와 같은 규칙).

import { authHeaders, fetchOrNetworkError, HttpError } from "../../lib/http";
import { fromApiCourse, fromApiRouteType, toApiRouteType, type ApiCourse } from "../map/coursesApi";
import type { Course, RouteType } from "../map/types";

// ??가 아니라 ||인 이유는 coursesApi.ts 참고 (빈 값도 폴백으로 보낸다).
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/** 찜한 코스 하나. 코스 탐색과 같은 카드를 그리므로 코스와 찜 정보를 함께 담는다. */
export interface SavedCourse {
  course: Course;
  /** 찜한 종목. 코스가 가진 경로(course.routes)가 아니라 이 회원이 고른 종목이다. */
  routeType: RouteType;
  savedAt: string;
}

/** 하트 상태만 그리는 데 쓰는 가벼운 항목. */
export interface SavedCourseKey {
  courseId: number;
  routeType: RouteType;
}

type ApiSavedCourse = ApiCourse & { route_type: string; saved_at: string };

/** GET /api/me/saved-courses — 마이페이지 찜 목록. 최근 찜한 순. */
export async function getSavedCourses(): Promise<SavedCourse[]> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/me/saved-courses`, { headers: authHeaders() });
  if (!res.ok) throw new HttpError(res.status, `찜한 코스 조회 실패 (${res.status})`);
  const data: { courses?: ApiSavedCourse[] } = await res.json();
  return (data.courses ?? []).map((c) => ({
    course: fromApiCourse(c),
    routeType: fromApiRouteType(c.route_type),
    savedAt: c.saved_at,
  }));
}

/** GET /api/me/saved-courses/keys — 무엇을 찜했는지만. 목록·상세의 하트 상태에 쓴다. */
export async function getSavedCourseKeys(): Promise<SavedCourseKey[]> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/me/saved-courses/keys`, { headers: authHeaders() });
  if (!res.ok) throw new HttpError(res.status, `찜 목록 조회 실패 (${res.status})`);
  const data: { course_id: number; route_type: string }[] = await res.json();
  return data.map((k) => ({ courseId: k.course_id, routeType: fromApiRouteType(k.route_type) }));
}

/** POST /api/me/saved-courses — 찜하기. 이미 찜했어도 성공이다. */
export async function addSavedCourse(courseId: number, routeType: RouteType): Promise<void> {
  const res = await fetchOrNetworkError(`${API_BASE}/api/me/saved-courses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ course_id: courseId, route_type: toApiRouteType(routeType) }),
  });
  if (!res.ok) throw new HttpError(res.status, `찜하기 실패 (${res.status})`);
}

/** DELETE /api/me/saved-courses/{id} — 찜 해제. 찜하지 않았어도 성공이다. */
export async function removeSavedCourse(courseId: number, routeType: RouteType): Promise<void> {
  const params = new URLSearchParams({ route_type: toApiRouteType(routeType) });
  const res = await fetchOrNetworkError(`${API_BASE}/api/me/saved-courses/${courseId}?${params}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new HttpError(res.status, `찜 해제 실패 (${res.status})`);
}
