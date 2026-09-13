import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Feature, FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";
import { buildRegionIndex, type RegionCodeMap, type RegionIndex } from "./regionMatch";

/** [x0,y0]-[x1,y1] 사각형 폴리곤 */
function square(x0: number, y0: number, x1: number, y1: number): Feature["geometry"] {
  return {
    type: "Polygon",
    coordinates: [
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ],
    ],
  };
}

const fc = (features: Feature[]): FeatureCollection => ({ type: "FeatureCollection", features });

const feat = (geometry: Feature["geometry"], properties: Feature["properties"]): Feature => ({
  type: "Feature",
  geometry,
  properties,
});

// 시도 두 개를 나란히 둔다. 11은 왼쪽, 12는 오른쪽.
const SIDO = fc([
  feat(square(0, 0, 10, 10), { sido_code: "11", sido_name: "가시" }),
  feat(square(10, 0, 20, 10), { sido_code: "12", sido_name: "나도" }),
]);

describe("buildRegionIndex", () => {
  it("대응표에 있는 시군구에 DB 지역 코드를 붙인다", () => {
    const all = fc([
      feat(square(1, 1, 3, 3), { sgg_code: "1001", name: "가군" }),
      feat(square(11, 1, 13, 3), { sgg_code: "2001", name: "나군" }),
    ]);
    const codeMap: RegionCodeMap = { "1001": "11110", "2001": "12780" };

    const [a, b] = buildRegionIndex(all, SIDO, codeMap);

    expect(a).toMatchObject({ name: "가군", sidoCode: "11", regionCode: "11110" });
    expect(b).toMatchObject({ name: "나군", sidoCode: "12", regionCode: "12780" });
  });

  it("대응표에 없는 시군구는 regionCode가 null이라 색칠 대상이 될 수 없다", () => {
    // 행정 개편 전 도형처럼 DB에 대응이 없는 경우. 지도에는 회색으로 남는다.
    const all = fc([feat(square(1, 1, 3, 3), { sgg_code: "9999", name: "옛구" })]);

    const [entry] = buildRegionIndex(all, SIDO, {});

    expect(entry.regionCode).toBeNull();
    expect(entry.sidoCode).toBe("11"); // 시도는 도형으로 정해지므로 여전히 붙는다
  });

  it("어느 시도 폴리곤에도 안 들어가면 가장 가까운 시도로 보낸다", () => {
    // 강진군처럼 내부점이 시도 경계 밖으로 나가는 섬·해안 지역.
    // null로 두면 드릴다운 목록에서 통째로 빠진다.
    const all = fc([feat(square(21, 1, 23, 3), { sgg_code: "3001", name: "먼섬군" })]);

    const [entry] = buildRegionIndex(all, SIDO, { "3001": "12999" });

    expect(entry.sidoCode).toBe("12"); // 오른쪽 시도가 더 가깝다
  });

  it("지원 대상 여부를 정하지 않는다 — 활성 판정은 호출부 몫", () => {
    // 활성 지역을 다시 조회해도 이 계산을 다시 돌 필요가 없어야 한다.
    const all = fc([feat(square(1, 1, 3, 3), { sgg_code: "1001", name: "가군" })]);

    const entries = buildRegionIndex(all, SIDO, { "1001": "11110" });

    expect(entries[0]).not.toHaveProperty("supportCode");
    expect(entries[0].regionCode).toBe("11110");
  });
});

describe("region-index.json + 실제 지도 도형", () => {
  // 대응표의 값만 보면 도형 키가 엉뚱해도 통과한다. 실제 GeoJSON을 통과시켜
  // "그 지역이 지도에서 실제로 집히는지"까지 확인한다.
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(HERE, p), "utf8"));

  const index: RegionIndex = read("../../../public/region-index.json");
  const allRegions: FeatureCollection = read("../../../public/korea-all-regions.json");
  const sidoFc: FeatureCollection = read("../../../public/korea-sido.json");

  const seed: string = fs.readFileSync(
    path.resolve(HERE, "../../../../backend/sql/02_region_seed.sql"),
    "utf8",
  );
  const dropCodes = [...seed.matchAll(/\('(\d+)',\s*'[^']+',\s*'[^']+',\s*true\)/g)].map(
    (m) => m[1],
  );

  const entries = buildRegionIndex(allRegions, sidoFc, index.byShape);
  const drawnCodes = new Set(entries.map((e) => e.regionCode).filter(Boolean));

  it("인구감소지역이 전부 실제 도형에 연결된다", () => {
    // 하나라도 빠지면 그 지역은 제도가 생겨도 지도에서 영영 색칠되지 않는다.
    // 옹진군(28720)이 예전 정적 파일에서 빠져 있던 실제 사례다.
    expect(dropCodes.length).toBe(89); // 시드 파싱이 깨지면 통과해버리는 걸 막는다
    expect(dropCodes.filter((c) => !drawnCodes.has(c))).toEqual([]);
  });

  it("폴백 목록(supportRegions)도 전부 도형에 연결된다", () => {
    // 조회 실패 시 이 목록으로 색칠하므로, 여기 있는데 도형이 없으면 조용히 사라진다
    expect(index.supportRegions.filter((c) => !drawnCodes.has(c))).toEqual([]);
  });

  it("지원 시드가 제도를 거는 지역이 전부 도형에 연결된다", () => {
    // /api/support/regions는 인구감소지역으로 제한되지 않는다. support_region에 걸린
    // 지역이면 무엇이든 반환하므로, 시드가 코드를 직접 적어 거는 지역도 도형이 있어야 한다.
    // 없으면 API는 활성으로 주는데 지도에서는 조용히 빠진다.
    const supportSeed = fs.readFileSync(
      path.resolve(HERE, "../../../../backend/sql/03_support_seed.sql"),
      "utf8",
    );
    const seeded = [...new Set([...supportSeed.matchAll(/'(\d{5})'/g)].map((m) => m[1]))];

    expect(seeded.length).toBeGreaterThan(50); // 파싱이 깨지면 통과해버리는 걸 막는다
    expect(seeded.filter((c) => !drawnCodes.has(c))).toEqual([]);
  });

  it("도형에 연결된 지역은 이름을 갖는다", () => {
    // 이름이 없으면 우측 패널 제목에 지역 코드가 그대로 노출된다
    const nameless = [...drawnCodes].filter((c) => !index.names[c!]);
    expect(nameless).toEqual([]);
  });

  it("옹진군이 코드·시도·이름 모두 바르게 잡힌다", () => {
    const ongjin = entries.find((e) => e.regionCode === "28720");
    expect(ongjin).toBeDefined();
    // 지도 배지는 도형 파일의 짧은 이름을 쓴다
    expect(ongjin!.name).toBe("옹진군");
    expect(ongjin!.sidoCode).toBe("28");
    // 패널 제목은 시도를 앞에 붙인다 — '서구'가 4곳, '동구'가 5곳이라 구분이 필요하다
    expect(index.names["28720"]).toBe("인천광역시 옹진군");
  });

  it("패널용 이름에 시도를 붙이되 시도명과 같으면 겹쳐 적지 않는다", () => {
    expect(index.names["26140"]).toBe("부산광역시 서구");
    expect(index.names["36110"]).toBe("세종특별자치시");
  });

  it("한 지역 코드에 도형이 둘 이상 붙지 않는다", () => {
    const seen = new Set<string>();
    const dup: string[] = [];
    for (const code of Object.values(index.byShape)) {
      if (seen.has(code)) dup.push(code);
      seen.add(code);
    }
    expect(dup).toEqual([]);
  });
});
