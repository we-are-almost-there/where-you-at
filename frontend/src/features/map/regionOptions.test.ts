import { describe, it, expect } from "vitest";
import {
  buildRegionOptions,
  hasRegionOption,
  regionOptionLabel,
  type RegionGroup,
  type RegionSelectItem,
} from "./regionOptions";
import type { Region } from "./types";

const asGroup = (item: RegionSelectItem, name: string): RegionGroup => {
  if (!("options" in item)) throw new Error(`${name}은 그룹이어야 함`);
  return item;
};

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
    expect(opts[0]).toEqual({ value: "26", label: "부산" });
  });

  it("도는 그룹: 라벨 축약 + '전체' 첫 항목 + 시군구 접미사 제거", () => {
    const gyeongnam = asGroup(opts[1], "경남");
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
    const group = asGroup(opts[0], "전남광주통합특별시");
    expect(group.label).toBe("전남광주통합");
    expect(group.options[0]).toEqual({ value: "12", label: "전남광주통합 전체" });
    expect(group.options.slice(1)).toEqual([
      { value: "12110", label: "목포" },
      { value: "12130", label: "여수" },
      { value: "12210", label: "동구" }, // 떼면 한 글자라 원래 이름을 둔다
    ]);
  });
});

// 드롭다운에 없는 지역으로 들어오는 경로가 실제로 있다 — 방문 혜택 패널의
// '이 지역 코스 보러가기'는 늘 5자리 시군구 코드를 넘긴다.
describe("hasRegionOption", () => {
  const opts = buildRegionOptions(regions);

  it("그룹 안의 시군구도 찾는다", () => {
    expect(hasRegionOption(opts, "48820")).toBe(true); // 경남 고성군
    expect(hasRegionOption(opts, "26")).toBe(true); // 흡수된 부산
  });

  it("광역시의 구는 흡수돼 고를 수 있는 항목이 아니다", () => {
    // 영도구는 응답에 있지만 드롭다운에는 '부산' 하나로만 들어간다
    expect(hasRegionOption(opts, "26200")).toBe(false);
  });

  it("목록에 없는 지역은 없다고 답한다", () => {
    expect(hasRegionOption(opts, "11680")).toBe(false); // 코스 없는 서울 강남구
  });
});

describe("regionOptionLabel", () => {
  it("시도는 축약하고 시군구 접미사는 뗀다", () => {
    // 시도 그룹 밖에 홀로 서는 항목이라 시도를 남긴다 — '강화'만으로는 어디인지 모른다
    expect(regionOptionLabel("인천광역시 강화군")).toBe("인천 강화");
    expect(regionOptionLabel("서울특별시 강남구")).toBe("서울 강남");
  });

  it("접미사를 떼면 한 글자만 남는 이름은 그대로 둔다", () => {
    // 중구·동구·서구·남구·북구가 '부산 동'이 되면 무엇인지 알아볼 수 없다
    expect(regionOptionLabel("부산광역시 동구")).toBe("부산 동구");
    expect(regionOptionLabel("대구광역시 중구")).toBe("대구 중구");
  });

  it("시도와 이름이 같은 세종은 한 덩어리로 줄인다", () => {
    expect(regionOptionLabel("세종특별자치시")).toBe("세종");
  });
});
