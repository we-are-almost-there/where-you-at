import type { RegionSelectItem } from "../map/regionOptions";
import { SIDO_ABBR } from "../../lib/regionLabels";
import type { BicycleRegionOption } from "./bicycleApi";
import type { BicycleSubregionOption } from "./bicycleApi";

const sidoCode = (regionCode: string) => regionCode.slice(0, 2);

// SIDO_ABBR는 공용 지역명 표를 그대로 재사용한다(18개 항목 중복 정의 방지).
const abbrevSido = (sido: string) => SIDO_ABBR[sido] ?? sido;

/**
 * BicycleRegionOption[]을 지역 필터 1단계 드롭다운 구조로 변환한다.
 * 세부 그룹핑(시/군/구) 없이 모든 시/도를 동일하게 flat 옵션으로만 만든다.
 * 세부 지역 선택은 전부 별도의 "구" 드롭다운(list_bicycle_subregions API)에서
 * 처리한다 — 예전엔 "도"만 optgroup으로 하위 시/군을 미리 펼쳐 보여줬는데,
 * 제주(시/군이 2개뿐)나 전남광주통합(광주 구+전남 시/군 혼재) 같은 특수
 * 케이스에서 "구" 드롭다운과 내용이 중복되는 문제가 있어 단순화했다.
 */
export function buildBicycleRegionOptions(regions: BicycleRegionOption[]): RegionSelectItem[] {
  const seen = new Set<string>();
  const items: { code2: string; sido: string }[] = [];

  for (const r of regions) {
    const code2 = sidoCode(r.region_code);
    if (seen.has(code2)) continue;
    seen.add(code2);
    items.push({ code2, sido: r.sido });
  }

  // "시"(특별시/광역시/세종 등, 하위에 별도 시/군/구 개편 없이 그 자체가 최종 단위)를
  // 먼저, "도"(경기/강원 등, 하위에 여러 시/군/구가 있는 광역 단위)를 나중에 배치한다.
  // 전남광주통합처럼 "특별시"로 끝나지만 실제로는 광주+전남을 아우르는 예외는
  // "통합"이 포함된 이름으로 판별해 "도" 취급한다.
  const isDo = (sido: string) => sido.endsWith("도") || sido.includes("통합");
  const siItems = items.filter((i) => !isDo(i.sido));
  const doItems = items.filter((i) => isDo(i.sido));

  const toOption = (i: { code2: string; sido: string }): RegionSelectItem => ({
    value: i.code2,
    label: abbrevSido(i.sido),
  });

  return [...siItems.map(toOption), ...doItems.map(toOption)];
}

/**
 * 2단계 "구" 드롭다운용 옵션을 만든다. 우리나라 행정구역이 "도 → 시/군 →
 * (일부 시만) 구"로 불균등한 3단계라, 2단계 리스트 안에 "광명시"(그 자체가
 * 최종 단위)와 "수원시 장안구"(그 아래 구까지 있음)처럼 서로 다른 깊이가
 * 섞여 나온다. 이를 그대로 나열하면 위계가 안 보여 어색하므로, 이름에
 * "OO시 XX구" 패턴이 있는 것만 "OO시" 그룹(optgroup)으로 묶고, 나머지
 * (시/군 자체, 또는 전남광주통합의 "동구"처럼 접두어 없이 구만 있는 경우)는
 * 단독 옵션으로 그대로 둔다.
 *
 * cityKey(region_code 앞 4자리)로 같은 시의 구들을 묶는다. 영동군/증평군처럼
 * 4자리 접두가 우연히 겹치는 "군" 지역이 실제로 있지만("구"가 없는 이름이라
 * standalone으로 빠져 이 경로를 타지 않음), "OO시 XX구" 패턴을 가진 지역들
 * 사이에서는 4자리 접두 충돌이 없음을 실제 region 테이블로 확인했다
 * (SELECT ... WHERE name LIKE '%시%구' GROUP BY LEFT(region_code,4)
 * HAVING COUNT(DISTINCT ...) > 1 → 0 rows).
 */
export function buildBicycleSubregionOptions(subregions: BicycleSubregionOption[]): RegionSelectItem[] {
  const groupedByCity = new Map<string, { cityName: string; items: BicycleSubregionOption[] }>();
  const standalone: BicycleSubregionOption[] = [];

  for (const s of subregions) {
    const match = s.name.match(/^(.+?[시군])(.+구)$/);
    if (match) {
      const cityName = match[1]; // "수원시"
      const cityKey = s.region_code.slice(0, 4);
      if (!groupedByCity.has(cityKey)) {
        groupedByCity.set(cityKey, { cityName, items: [] });
      }
      groupedByCity.get(cityKey)!.items.push(s);
    } else {
      standalone.push(s);
    }
  }

  const standaloneOptions: RegionSelectItem[] = standalone.map((s) => ({
    value: s.region_code,
    label: `${s.name} (${s.cnt})`,
  }));

  const groupOptions: RegionSelectItem[] = Array.from(groupedByCity.values()).map(({ cityName, items }) => ({
    label: cityName,
    options: items.map((s) => {
      const guName = s.name.slice(cityName.length).trim(); // "수원시 장안구" → "장안구"
      return { value: s.region_code, label: `${guName} (${s.cnt})` };
    }),
  }));

  return [...standaloneOptions, ...groupOptions];
}
