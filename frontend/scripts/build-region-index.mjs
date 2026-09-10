// public/region-index.json 생성기
//
// 지도 도형(korea-all-regions.json)과 DB의 지역 코드는 코드 체계가 다르다.
//   - korea-all-regions.json : 통계청(KOSTAT) 시군구 코드 (강진군 36590)
//   - DB region 테이블       : 법정동 기반 프로젝트 코드 (강진군 12780)
// 둘을 (시도, 시군구 이름)으로 이어 대응표를 만든다. 시도는 도형 내부점이
// 어느 시도 폴리곤에 들어가는지로 구한다 — 이름만으로는 '중구'가 6곳이라 갈리지 않는다.
//
// 이 표가 있어야 지도가 "정적 지원지역 파일에 있는 지역"이 아니라
// "DB에 등록된 모든 지역"을 색칠 대상으로 다룰 수 있다.
//
// 내보내는 것
//   byShape        도형(sgg_code) → DB 지역 코드. 지도 색칠 판정에 쓴다.
//   names          DB 지역 코드 → 지역명. 우측 패널 제목에 쓴다.
//   supportRegions 지원 대상이 될 수 있는 지역(인구감소지역). 활성 지역 조회가
//                  실패했을 때의 폴백 목록이다.
//
// 이 셋을 담으면서 support-regions-geo.json(762KB)을 받을 이유가 없어졌다.
// 그 파일은 지원지역 88곳만 담고 있어 옹진군이 빠져 있었고, 이름 조회도 거기 기대고 있었다.
//
// 실행: npm run generate:region-index   (frontend 폴더에서)
// 저장된 파일이 최신인지 확인만 하려면: npm run check:region-index
// region_seed.sql이나 지도 도형 파일이 바뀌면 다시 돌린다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, "..");
const PUBLIC = path.join(FRONTEND, "public");
const SEED = path.resolve(FRONTEND, "../backend/sql/02_region_seed.sql");
const SUPPORT_SEED = path.resolve(FRONTEND, "../backend/sql/03_support_seed.sql");
const OUT = path.join(PUBLIC, "region-index.json");
// --check: 파일을 쓰지 않고 저장본이 지금 계산 결과와 같은지만 본다 (CI·빌드 전 확인용)
const CHECK_ONLY = process.argv.includes("--check");

// 폴리곤 파일의 표기가 DB와 다른 경우. 행정 개편이 아니라 단순 표기 차이만 여기 둔다.
const NAME_ALIAS = { 세종시: "세종특별자치시" };

const polysOf = (g) =>
  g.type === "MultiPolygon" ? g.coordinates : g.type === "Polygon" ? [g.coordinates] : [];

function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
const inPoly = (p, poly) => inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h));
const inGeom = (p, g) => polysOf(g).some((poly) => inPoly(p, poly));

/** 도형 안에 확실히 들어가는 점 하나 (regionMatch.ts의 같은 이름 함수와 같은 규칙) */
function interiorPoint(g) {
  let best = null;
  let bestLen = 0;
  for (const poly of polysOf(g)) {
    if (poly[0].length > bestLen) {
      bestLen = poly[0].length;
      best = poly;
    }
  }
  const ring = best[0];
  let sx = 0;
  let sy = 0;
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
  }
  const mid = [sx / ring.length, sy / ring.length];
  if (inPoly(mid, best)) return mid;
  const step = Math.max(1, Math.floor(ring.length / 60));
  for (let i = 0; i < ring.length - 2; i += step) {
    const p = [
      (ring[i][0] + ring[i + 2][0] + mid[0]) / 3,
      (ring[i][1] + ring[i + 2][1] + mid[1]) / 3,
    ];
    if (inPoly(p, best)) return p;
  }
  return mid;
}

const bboxOf = (g) => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const poly of polysOf(g))
    for (const ring of poly)
      for (const [x, y] of ring) {
        if (x < a) a = x;
        if (y < b) b = y;
        if (x > c) c = x;
        if (y > d) d = y;
      }
  return [a, b, c, d];
};

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const seedText = fs.readFileSync(SEED, "utf8");
const db = [];
for (const m of seedText.matchAll(/\('(\d+)',\s*'([^']+)',\s*'([^']+)',\s*(true|false)\)/g)) {
  db.push({ code: m[1], name: m[2], sido: m[3], drop: m[4] === "true" });
}
if (!db.length) throw new Error(`region_seed 파싱 실패: ${SEED}`);

const sido = read(path.join(PUBLIC, "korea-sido.json"));
const all = read(path.join(PUBLIC, "korea-all-regions.json"));

// DB 지역코드 앞 2자리가 곧 시도 코드다 (korea-sido.json의 sido_code와 같은 체계)
const byKey = new Map(db.map((r) => [`${r.code.slice(0, 2)}|${r.name}`, r.code]));
const sidoBoxes = sido.features.map((f) => bboxOf(f.geometry));

function sidoCodeOf(point) {
  for (let i = 0; i < sido.features.length; i++) {
    const b = sidoBoxes[i];
    if (point[0] < b[0] || point[0] > b[2] || point[1] < b[1] || point[1] > b[3]) continue;
    if (inGeom(point, sido.features[i].geometry)) {
      return String(sido.features[i].properties.sido_code);
    }
  }
  // 경계에 걸친 섬 등 — 가장 가까운 시도로 (regionMatch.ts와 같은 폴백).
  // 강진군이 여기 걸린다. 이게 없으면 지원지역 하나가 통째로 빠진다.
  let nearest = null;
  let best = Infinity;
  sidoBoxes.forEach((b, i) => {
    const d = Math.hypot(point[0] - (b[0] + b[2]) / 2, point[1] - (b[1] + b[3]) / 2);
    if (d < best) {
      best = d;
      nearest = String(sido.features[i].properties.sido_code);
    }
  });
  return nearest;
}

const byShape = {};
const unmatched = [];
for (const f of all.features) {
  const sgg = String(f.properties.sgg_code);
  const raw = String(f.properties.name);
  const name = NAME_ALIAS[raw] ?? raw;
  const sc = sidoCodeOf(interiorPoint(f.geometry));
  const hit = sc ? byKey.get(`${sc}|${name}`) : undefined;
  if (hit) byShape[sgg] = hit;
  else unmatched.push({ sgg, name: raw, sidoCode: sc });
}

const mapped = new Set(Object.values(byShape));

// 제도가 걸릴 수 있는 지역은 전부 도형이 있어야 한다. 없으면 API는 그 지역을 활성으로
// 반환하는데 지도에는 그릴 도형이 없어 조용히 사라진다.
//   - 인구감소지역: 숙박세일처럼 is_population_drop 기준으로 거는 제도가 있다
//   - 지원 시드에 코드가 직접 적힌 지역: 관광주민증 52곳, 반값여행 차수 등
// 둘을 합친 것이 "제도가 걸릴 수 있는 범위"다.
const supportSeed = fs.readFileSync(SUPPORT_SEED, "utf8");
const seededCodes = new Set([...supportSeed.matchAll(/'(\d{5})'/g)].map((m) => m[1]));
const dropCodes = db.filter((r) => r.drop).map((r) => r.code);
const reachable = new Set([...dropCodes, ...seededCodes]);
const nameOf = new Map(db.map((r) => [r.code, `${r.sido} ${r.name}`]));
const missing = [...reachable].filter((c) => !mapped.has(c)).sort();

console.log(`도형 ${all.features.length}개 → 매칭 ${Object.keys(byShape).length}개`);
if (unmatched.length) {
  console.log(`\n도형에 대응하는 DB 지역이 없는 것 ${unmatched.length}개:`);
  for (const u of unmatched) console.log(`  sgg=${u.sgg} sido=${u.sidoCode} ${u.name}`);
}

// 도형이 없는 DB 지역은 실패로 보지 않는다. 대부분 행정구(수원시 장안구 등)라
// 지도가 시 단위로 병합한 결과이고, 제도가 그 단위로 걸리지는 않는다.
// 다만 몇 곳인지는 남겨서, 늘어나면 눈에 띄게 한다.
const noShape = db.filter((r) => !mapped.has(r.code));
console.log(`\nDB 지역 ${db.length}곳 중 도형이 없는 곳 ${noShape.length}곳 (행정구·개편 신설구)`);

console.log(
  `제도가 걸릴 수 있는 지역 ${reachable.size}곳` +
    ` (인구감소지역 ${dropCodes.length} + 지원 시드 명시 ${seededCodes.size})` +
    ` 중 도형 없는 곳: ${missing.length}`,
);
for (const c of missing) console.log(`  ${c} ${nameOf.get(c) ?? "(region_seed에 없는 코드)"}`);

if (missing.length) {
  console.error(
    "\n제도가 걸릴 수 있는 지역이 대응표에서 빠졌다." +
      " 그 지역은 API가 활성으로 반환해도 지도에 그려지지 않는다." +
      " 이름 표기나 도형 데이터를 확인할 것.",
  );
  process.exit(1);
}

// 이름은 DB에 있는 지역 전부를 담는다. 도형이 없는 지역도 목록 제목에는 나올 수 있다.
const names = {};
for (const r of db) names[r.code] = r.name;

const index = {
  byShape,
  names,
  supportRegions: db.filter((r) => r.drop).map((r) => r.code),
};
const serialized = JSON.stringify(index) + "\n";

if (CHECK_ONLY) {
  // 줄끝은 무시하고 내용만 본다. core.autocrlf=true인 환경에서 체크아웃하면
  // 이 파일이 CRLF로 풀려서, 내용이 같은데도 검사가 실패한다.
  const saved = fs.existsSync(OUT)
    ? fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n")
    : null;
  if (saved !== serialized) {
    console.error(
      "\npublic/region-index.json이 최신이 아니다. `npm run generate:region-index`를 돌리고 커밋할 것.",
    );
    process.exit(1);
  }
  console.log("\n저장된 public/region-index.json이 최신이다.");
} else {
  fs.writeFileSync(OUT, serialized);
  console.log(
    `\n생성: public/region-index.json (${fs.statSync(OUT).size} bytes)` +
      ` — 도형 ${Object.keys(byShape).length} / 이름 ${Object.keys(names).length}` +
      ` / 지원 대상 ${index.supportRegions.length}`,
  );
}
