import type { Region } from "./types";
import { SIDO_ABBR } from "../../lib/regionLabels";

// 지역 필터 드롭다운 항목: flat 단일 옵션(광역시) 또는 optgroup(도)
export interface RegionFlat {
  value: string;
  label: string;
}
export interface RegionGroup {
  label: string; // 시도명 (optgroup 라벨)
  options: RegionFlat[];
}
export type RegionSelectItem = RegionFlat | RegionGroup;

// 시군구 5자리 코드의 앞 2자리 = 시도 코드 (행정표준코드). 접두 매칭으로 시도 전체를 커버.
const sidoCode = (regionCode: string) => regionCode.slice(0, 2);

// 이름은 '시'로 끝나지만 옛 도(道) 전체를 아우르는 초광역이라, 광역시처럼 흡수하지 않고
// 시군 optgroup으로 전개한다(목포·여수·순천 등 개별 필터 유지).
const EXPAND_AS_PROVINCE = new Set(["전남광주통합특별시"]);

// 필터 드롭다운은 좁으므로 정식 시도명을 축약해서 표시한다 (경상남도→경남, 부산광역시→부산).
const abbrevSido = (sido: string) => SIDO_ABBR[sido] ?? sido;
// 시군구도 접미사(시/군/구)를 떼어 간결하게 (창원시→창원, 고성군→고성). 매핑 없으면 원본.
// 떼고 한 글자만 남으면 원래 이름을 둔다 — 중구·동구·서구·남구·북구가 '중'·'동'으로 줄면
// 무엇인지 알아볼 수 없다.
const abbrevSigungu = (name: string) => {
  const short = name.replace(/(시|군|구)$/, "");
  return short.length > 1 ? short : name;
};

/** 드롭다운 항목 중에 이 값을 고를 수 있는지 (optgroup 안까지 본다) */
export function hasRegionOption(items: RegionSelectItem[], value: string): boolean {
  return items.some((item) =>
    "options" in item ? item.options.some((o) => o.value === value) : item.value === value,
  );
}

/**
 * region-index.json의 '{시도} {하위 지역...}' 이름을 드롭다운 라벨로 줄인다.
 * ('인천광역시 강화군' → '인천 강화', '경기도 수원시 장안구' → '경기 수원 장안')
 *
 * 다른 항목과 달리 시도 optgroup 밖에 홀로 서므로 시도를 라벨에 남긴다 — '강화'만 뜨면
 * 어느 시도의 어디인지 알 수 없다. 세종처럼 시도와 이름이 같아 한 덩어리인 이름은 그대로 줄인다.
 */
export function regionOptionLabel(fullName: string): string {
  const [sido, ...subregions] = fullName.split(" ");
  if (subregions.length === 0) return abbrevSido(sido);
  return [abbrevSido(sido), ...subregions.map(abbrevSigungu)].join(" ");
}

/**
 * /api/regions 응답을 지역 필터 드롭다운 구조로 변환한다.
 * - 광역시/특별시/세종(sido가 "도"로 안 끝남): 구(區)를 시도 하나로 흡수한 flat 옵션(value=2자리).
 * - 도(道): optgroup. 첫 항목 "○○ 전체"(value=2자리) + 시군구별 옵션(value=5자리).
 * 맨 앞 "전체 지역"(value="")은 여기 포함하지 않는다(필터 컴포넌트가 항상 렌더).
 */
export function buildRegionOptions(regions: Region[]): RegionSelectItem[] {
  // sido 등장 순서 유지(백엔드가 region_code ASC 정렬 → 시도 코드 오름차순)
  const order: string[] = [];
  const bySido = new Map<string, Region[]>();
  for (const r of regions) {
    if (!bySido.has(r.sido)) {
      bySido.set(r.sido, []);
      order.push(r.sido);
    }
    bySido.get(r.sido)!.push(r);
  }

  return order.map((sido): RegionSelectItem => {
    const rows = bySido.get(sido)!;
    const code2 = sidoCode(rows[0].region_code);
    if (!sido.endsWith("도") && !EXPAND_AS_PROVINCE.has(sido)) {
      return { value: code2, label: abbrevSido(sido) }; // 광역시/특별시/세종 → 흡수
    }
    return {
      label: abbrevSido(sido),
      options: [
        { value: code2, label: `${abbrevSido(sido)} 전체` },
        ...rows.map((r) => ({ value: r.region_code, label: abbrevSigungu(r.name) })),
      ],
    };
  });
}
