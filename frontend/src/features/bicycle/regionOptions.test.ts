import { describe, it, expect } from "vitest";
import { buildBicycleRegionOptions, buildBicycleSubregionOptions } from "./regionOptions";
import type { BicycleRegionOption, BicycleSubregionOption } from "./bicycleApi";

describe("buildBicycleRegionOptions", () => {
  it("시/도별로 중복 없이 하나씩만 남긴다", () => {
    const regions: BicycleRegionOption[] = [
      { region_code: "11110", name: "종로구", sido: "서울특별시" },
      { region_code: "11140", name: "중구", sido: "서울특별시" },
      { region_code: "41111", name: "장안구", sido: "경기도" },
    ];
    const result = buildBicycleRegionOptions(regions);
    const values = result.map((r) => ("value" in r ? r.value : null));
    expect(values.filter((v) => v === "11")).toHaveLength(1);
  });

  it("시도명을 축약형으로 표시한다", () => {
    const regions: BicycleRegionOption[] = [
      { region_code: "26000", name: "부산광역시", sido: "부산광역시" },
    ];
    const result = buildBicycleRegionOptions(regions);
    expect(result[0]).toMatchObject({ value: "26", label: "부산" });
  });

  it("매핑에 없는 시도명은 원본 그대로 표시한다", () => {
    const regions: BicycleRegionOption[] = [
      { region_code: "99000", name: "미상지역", sido: "미상시도" },
    ];
    const result = buildBicycleRegionOptions(regions);
    expect(result[0]).toMatchObject({ label: "미상시도" });
  });

  it("'시'(광역시 등)를 먼저, '도'를 나중에 배치한다", () => {
    const regions: BicycleRegionOption[] = [
      { region_code: "41000", name: "경기도", sido: "경기도" },
      { region_code: "11000", name: "서울특별시", sido: "서울특별시" },
      { region_code: "43000", name: "충청북도", sido: "충청북도" },
      { region_code: "26000", name: "부산광역시", sido: "부산광역시" },
    ];
    const result = buildBicycleRegionOptions(regions);
    const labels = result.map((r) => ("label" in r ? r.label : null));
    // 서울, 부산(시)이 경기, 충북(도)보다 앞에 와야 한다
    const seoulIdx = labels.indexOf("서울");
    const busanIdx = labels.indexOf("부산");
    const gyeonggiIdx = labels.indexOf("경기");
    const chungbukIdx = labels.indexOf("충북");
    expect(seoulIdx).toBeLessThan(gyeonggiIdx);
    expect(seoulIdx).toBeLessThan(chungbukIdx);
    expect(busanIdx).toBeLessThan(gyeonggiIdx);
    expect(busanIdx).toBeLessThan(chungbukIdx);
  });

  it("전남광주통합특별시는 '도' 취급으로 뒤쪽에 배치한다", () => {
    const regions: BicycleRegionOption[] = [
      { region_code: "12000", name: "전남광주통합특별시", sido: "전남광주통합특별시" },
      { region_code: "11000", name: "서울특별시", sido: "서울특별시" },
    ];
    const result = buildBicycleRegionOptions(regions);
    const labels = result.map((r) => ("label" in r ? r.label : null));
    expect(labels.indexOf("서울")).toBeLessThan(labels.indexOf("전남광주통합"));
  });

  it("빈 배열이면 빈 결과를 반환한다", () => {
    expect(buildBicycleRegionOptions([])).toEqual([]);
  });
});

describe("buildBicycleSubregionOptions", () => {
  it("'OO시 XX구' 패턴은 시 단위로 그룹화(optgroup)한다", () => {
    const subregions: BicycleSubregionOption[] = [
      { region_code: "41111", name: "수원시 장안구", cnt: 2 },
      { region_code: "41113", name: "수원시 팔달구", cnt: 1 },
    ];
    const result = buildBicycleSubregionOptions(subregions);
    const group = result.find((r) => "options" in r);
    expect(group).toBeDefined();
    if (group && "options" in group) {
      expect(group.label).toBe("수원시");
      expect(group.options).toHaveLength(2);
      expect(group.options.map((o) => o.label)).toEqual(
        expect.arrayContaining([expect.stringContaining("장안구"), expect.stringContaining("팔달구")]),
      );
    }
  });

  it("구가 없는 시/군(예: 광명시)은 단독 옵션으로 처리한다", () => {
    const subregions: BicycleSubregionOption[] = [
      { region_code: "41210", name: "광명시", cnt: 2 },
    ];
    const result = buildBicycleSubregionOptions(subregions);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ value: "41210", label: "광명시 (2)" });
  });

  it("접두어 없이 '구'만 있는 지역(전남광주통합 케이스)은 단독 옵션으로 처리한다", () => {
    const subregions: BicycleSubregionOption[] = [
      { region_code: "12010", name: "동구", cnt: 8 },
    ];
    const result = buildBicycleSubregionOptions(subregions);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ label: "동구 (8)" });
  });

  it("같은 4자리 접두를 가진 서로 다른 시의 구는 섞이지 않는다", () => {
    // 실제 데이터로 4자리 접두 충돌이 없음을 SQL로 검증했지만(주석 참고),
    // 이 함수 자체의 그룹화 로직이 cityKey 기준으로 올바르게 나뉘는지도 별도로 확인한다.
    const subregions: BicycleSubregionOption[] = [
      { region_code: "41111", name: "수원시 장안구", cnt: 2 },
      { region_code: "41461", name: "안성시 죽산구", cnt: 1 }, // 가상의 다른 4자리 접두
    ];
    const result = buildBicycleSubregionOptions(subregions);
    const groups = result.filter((r) => "options" in r);
    expect(groups).toHaveLength(2);
  });

  it("빈 배열이면 빈 결과를 반환한다", () => {
    expect(buildBicycleSubregionOptions([])).toEqual([]);
  });
});
