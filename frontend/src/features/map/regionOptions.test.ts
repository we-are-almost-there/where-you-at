import { describe, it, expect } from "vitest";
import { buildRegionOptions, isGroup } from "./regionOptions";
import type { Region } from "./types";

// /api/regions 실제 응답 형태 (부산 광역시 3 + 경남 도 4)
const regions: Region[] = [
  { region_code: "26110", name: "중구", sido: "부산광역시", is_population_drop: false },
  { region_code: "26200", name: "영도구", sido: "부산광역시", is_population_drop: true },
  { region_code: "26380", name: "사하구", sido: "부산광역시", is_population_drop: false },
  { region_code: "48120", name: "창원시", sido: "경상남도", is_population_drop: false },
  { region_code: "48220", name: "통영시", sido: "경상남도", is_population_drop: false },
  { region_code: "48310", name: "거제시", sido: "경상남도", is_population_drop: false },
  { region_code: "48820", name: "고성군", sido: "경상남도", is_population_drop: true },
];

describe("buildRegionOptions", () => {
  const opts = buildRegionOptions(regions);

  it("시도 하나당 항목 하나 (광역시 흡수 + 도 그룹)", () => {
    expect(opts).toHaveLength(2);
  });

  it("광역시는 구를 흡수한 축약 flat 옵션 (부산광역시 → 부산, value=2자리)", () => {
    const busan = opts[0];
    expect(isGroup(busan)).toBe(false);
    expect(busan).toEqual({ value: "26", label: "부산" });
  });

  it("도는 그룹: 라벨 축약 + '전체' 첫 항목 + 시군구 접미사 제거", () => {
    const gyeongnam = opts[1];
    if (!isGroup(gyeongnam)) throw new Error("경남은 그룹이어야 함");
    expect(gyeongnam.label).toBe("경남");
    expect(gyeongnam.options[0]).toEqual({ value: "48", label: "경남 전체" });
    expect(gyeongnam.options.slice(1)).toEqual([
      { value: "48120", label: "창원" },
      { value: "48220", label: "통영" },
      { value: "48310", label: "거제" },
      { value: "48820", label: "고성" }, // 군 접미사도 제거
    ]);
  });

  it("빈 입력이면 빈 배열", () => {
    expect(buildRegionOptions([])).toEqual([]);
  });
});

describe("buildRegionOptions - 전남광주통합특별시", () => {
  // 이름은 '시'로 끝나지만 옛 도 전체를 아우르는 초광역 → 흡수하지 않고 시군 그룹으로 전개
  const merged: Region[] = [
    { region_code: "12110", name: "목포시", sido: "전남광주통합특별시", is_population_drop: false },
    { region_code: "12130", name: "여수시", sido: "전남광주통합특별시", is_population_drop: false },
    { region_code: "12210", name: "동구", sido: "전남광주통합특별시", is_population_drop: false },
  ];

  it("광역시처럼 흡수하지 않고 시군 그룹으로 전개", () => {
    const opts = buildRegionOptions(merged);
    expect(opts).toHaveLength(1);
    const group = opts[0];
    if (!isGroup(group)) throw new Error("전남광주통합특별시는 그룹이어야 함");
    expect(group.label).toBe("전남광주통합");
    expect(group.options[0]).toEqual({ value: "12", label: "전남광주통합 전체" });
    expect(group.options.slice(1)).toEqual([
      { value: "12110", label: "목포" },
      { value: "12130", label: "여수" },
      { value: "12210", label: "동" },
    ]);
  });
});
