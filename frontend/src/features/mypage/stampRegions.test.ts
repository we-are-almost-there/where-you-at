// 스탬프 시도 목록이 지도 도형 파일과 같은 행정구역 기준인지 확인한다.
// 도형 파일만 바꾸고 목록을 잊으면(또는 그 반대) 시도 수·시군구 수가 어긋나 여기서 실패한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STAMP_SIDO, TOTAL_SIGUNGU } from "./stampRegions";

interface Collection {
  features: { properties: Record<string, string> }[];
}

const readPublic = (name: string): Collection =>
  JSON.parse(readFileSync(resolve(__dirname, "../../../public", name), "utf-8"));

describe("STAMP_SIDO", () => {
  it("시도 코드·이름·순서가 korea-sido.json과 같다", () => {
    const sido = readPublic("korea-sido.json").features.map((f) => [f.properties.sido_code, f.properties.sido_name]);

    expect(STAMP_SIDO.map((s) => [s.code, s.name])).toEqual(sido);
  });

  it("시도별 시군구 수가 korea-all-regions.json의 도형 수와 같다", () => {
    const counts: Record<string, number> = {};
    for (const f of readPublic("korea-all-regions.json").features) {
      const code = f.properties.sgg_code.slice(0, 2);
      counts[code] = (counts[code] ?? 0) + 1;
    }

    expect(Object.fromEntries(STAMP_SIDO.map((s) => [s.code, s.sigunguCount]))).toEqual(counts);
    expect(TOTAL_SIGUNGU).toBe(230);
  });
});
