import type { CourseFilterState, Difficulty, RouteType } from "./types";

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
