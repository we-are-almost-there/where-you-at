import type { Region } from "./types";

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

export const isGroup = (item: RegionSelectItem): item is RegionGroup => "options" in item;

// 시군구 5자리 코드의 앞 2자리 = 시도 코드 (행정표준코드). 접두 매칭으로 시도 전체를 커버.
const sidoCode = (regionCode: string) => regionCode.slice(0, 2);

// 필터 드롭다운은 좁으므로 정식 시도명을 축약해서 표시한다 (경상남도→경남, 부산광역시→부산).
const SIDO_ABBR: Record<string, string> = {
  서울특별시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  경기도: "경기",
  강원특별자치도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  전북특별자치도: "전북",
  전라남도: "전남",
  전남광주통합특별시: "전남·광주", // 행정구역 개편: 광주·전남 통합
  경상북도: "경북",
  경상남도: "경남",
  제주특별자치도: "제주",
};
const abbrevSido = (sido: string) => SIDO_ABBR[sido] ?? sido;
// 시군구도 접미사(시/군/구)를 떼어 간결하게 (창원시→창원, 고성군→고성). 매핑 없으면 원본.
const abbrevSigungu = (name: string) => name.replace(/(시|군|구)$/, "");

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
    if (!sido.endsWith("도")) {
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
