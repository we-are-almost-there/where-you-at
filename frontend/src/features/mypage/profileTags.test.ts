import { describe, expect, it } from "vitest";
import { profileTags } from "./profileTags";
import type { RunRecord } from "./types";

const record = (distanceKm: number): RunRecord => ({
  id: 1,
  courseId: 1,
  courseName: "코스",
  routeType: "도보",
  distanceKm,
  durationMs: 1,
  paceSecPerKm: null,
  finishedAt: "2026-09-16T07:40:00+09:00",
});

describe("profileTags", () => {
  it("기록이 없으면 첫 완주를 권한다", () => {
    expect(profileTags([], [])).toEqual(["첫완주에도전"]);
  });

  it("완주 횟수와 총 거리를 적는다", () => {
    expect(profileTags([record(6.24), record(28.1)], [])).toEqual(["2번완주", "34.3km"]);
  });

  it("스탬프가 있으면 받은 시도 수를 붙인다 (같은 시도의 시군구는 하나로 센다)", () => {
    const stamps = [
      { sigunguCode: "12330", stampedAt: "2026-08-29" },
      { sigunguCode: "12730", stampedAt: "2026-09-03" },
      { sigunguCode: "51110", stampedAt: "2026-09-13" },
    ];
    expect(profileTags([record(5)], stamps)).toEqual(["1번완주", "5.0km", "2개시도"]);
  });

  it("거리가 천 km를 넘으면 자릿수 쉼표를 넣는다", () => {
    expect(profileTags([record(1234.56)], [])).toEqual(["1번완주", "1,234.6km"]);
  });
});
