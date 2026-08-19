import type { CourseFilterState, Difficulty, RouteType } from "./types";
import type { SpotCategory } from "../nearby/types";

export interface CourseUrlState {
  routeType: RouteType;
  filters: CourseFilterState;
  page: number;
}

export const DEFAULT_COURSE_FILTERS: CourseFilterState = {
  keyword: "",
  region: "",
  distance: "",
  difficulty: "",
  sort: "nearest",
};

const DISTANCES = new Set(["short", "mid", "long"]);
const DIFFICULTIES = new Set<Difficulty>(["쉬움", "보통", "어려움"]);
const DIFFICULTY_FROM_URL: Record<string, Difficulty> = {
  easy: "쉬움",
  medium: "보통",
  hard: "어려움",
};
const DIFFICULTY_TO_URL: Record<Difficulty, string> = {
  쉬움: "easy",
  보통: "medium",
  어려움: "hard",
};
const SORTS = new Set(["nearest", "distance_asc", "distance_desc", "time_asc", "time_desc"]);

export function parseRouteTypeParam(params: URLSearchParams): RouteType {
  return params.get("type") === "bicycle" ? "자전거" : "도보";
}

export function setRouteTypeParam(params: URLSearchParams, routeType: RouteType): void {
  if (routeType === "자전거") params.set("type", "bicycle");
  else params.delete("type");
}

export function parseCourseUrlState(params: URLSearchParams): CourseUrlState {
  const routeType = parseRouteTypeParam(params);
  const distance = params.get("distance") ?? "";
  const difficulty = DIFFICULTY_FROM_URL[params.get("difficulty") ?? ""] ?? "";
  const sort = params.get("sort") ?? "";
  const pageValue = Number(params.get("page"));
  const region = params.get("region") ?? "";

  return {
    routeType,
    filters: {
      keyword: params.get("keyword") ?? "",
      region: /^\d{2,5}$/.test(region) ? region : "",
      distance: DISTANCES.has(distance) ? distance : "",
      difficulty: DIFFICULTIES.has(difficulty as Difficulty) ? difficulty : "",
      sort: SORTS.has(sort) ? sort : DEFAULT_COURSE_FILTERS.sort,
    },
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  };
}

export function buildCourseSearchParams(state: CourseUrlState): URLSearchParams {
  const params = new URLSearchParams();
  setRouteTypeParam(params, state.routeType);
  if (state.filters.keyword) params.set("keyword", state.filters.keyword);
  if (state.filters.region) params.set("region", state.filters.region);
  if (state.filters.distance) params.set("distance", state.filters.distance);
  if (state.filters.difficulty) {
    params.set("difficulty", DIFFICULTY_TO_URL[state.filters.difficulty as Difficulty]);
  }
  if (state.filters.sort !== DEFAULT_COURSE_FILTERS.sort) params.set("sort", state.filters.sort);
  if (state.page > 1) params.set("page", String(state.page));
  return params;
}

export type InfoTab = "course" | "nearby";

const INFO_TABS = new Set<InfoTab>(["course", "nearby"]);
const SPOT_CATEGORIES = new Set<SpotCategory>(["attraction", "restaurant", "accommodation", "bicycle"]);

export function parseInfoTabParam(params: URLSearchParams): InfoTab {
  const raw = params.get("tab");
  return INFO_TABS.has(raw as InfoTab) ? (raw as InfoTab) : "course";
}

export function setInfoTabParam(params: URLSearchParams, tab: InfoTab): void {
  if (tab === "nearby") params.set("tab", "nearby");
  else {
    params.delete("tab");
    params.delete("category"); // 코스 정보로 돌아가면 카테고리 파라미터도 함께 정리
  }
}

export function parseCategoryParam(params: URLSearchParams): SpotCategory {
  const raw = params.get("category");
  return SPOT_CATEGORIES.has(raw as SpotCategory) ? (raw as SpotCategory) : "attraction";
}

export function setCategoryParam(params: URLSearchParams, category: SpotCategory): void {
  if (category === "attraction") params.delete("category"); // 기본값은 생략
  else params.set("category", category);
}
