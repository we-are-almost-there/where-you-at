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

/**
 * 생성물 자체가 쓸 수 있는 모양인지 본다. 시드가 없는 환경에서도 반드시 통과해야 하는
 * 최소 조건이다 — "파일이 없어서 검사를 건너뛰었다"가 "검사에 통과했다"가 되면 안 된다.
 */
function assertIndexUsable() {
  if (!fs.existsSync(OUT)) {
    throw new Error(`public/region-index.json이 없다. \`npm run generate:region-index\` 실행 후 커밋할 것.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(OUT, "utf8"));
  } catch (e) {
    throw new Error(`public/region-index.json이 올바른 JSON이 아니다: ${e.message}`);
  }
  const { byShape, names, supportRegions } = parsed ?? {};

  // 값 타입까지 본다. 지역 코드가 숫자로 들어가면 API가 주는 문자열 코드와 안 맞아
  // 색칠이 통째로 빠지고, 이름이 문자열이 아니면 패널 제목 렌더링이 깨진다.
  const isRecord = (v) => v != null && typeof v === "object" && !Array.isArray(v);
  const bad = [];
  if (!isRecord(byShape) || !Object.keys(byShape).length) bad.push("byShape가 비어 있거나 객체가 아님");
  if (!isRecord(names) || !Object.keys(names).length) bad.push("names가 비어 있거나 객체가 아님");
  if (!Array.isArray(supportRegions) || !supportRegions.length) bad.push("supportRegions가 비어 있거나 배열이 아님");
  if (bad.length) throw new Error(`public/region-index.json: ${bad.join(", ")}`);

  const notString = (pairs, label) =>
    pairs.filter(([, v]) => typeof v !== "string").slice(0, 5).map(([k]) => `${label}[${k}]`);
  const wrong = [
    ...notString(Object.entries(byShape), "byShape"),
    ...notString(Object.entries(names), "names"),
    ...notString(supportRegions.map((v, i) => [i, v]), "supportRegions"),
  ];
  if (wrong.length) {
    throw new Error(`public/region-index.json의 값이 문자열이 아니다: ${wrong.join(", ")}`);
  }

  // 도형이 가리키는 코드는 이름을 가져야 패널 제목이 코드로 노출되지 않는다
  const nameless = [...new Set(Object.values(byShape))].filter((c) => !names[c]);
  if (nameless.length) {
    throw new Error(`이름이 없는 지역 코드 ${nameless.length}건: ${nameless.slice(0, 5).join(", ")}`);
  }
  return parsed;
}

// 이 스크립트는 backend/sql/의 시드를 읽는다. 저장소 전체가 있는 환경(로컬·CI)에서는
// 문제가 없지만, frontend/만 빌드 컨텍스트로 복사하는 배포에서는 파일이 없다.
// 그때도 생성물 검사는 반드시 하고, 시드와 대조하는 검사만 건너뛴다.
//
// 검사를 통째로 테스트로 옮기지 않은 이유: 테스트는 배포 경로에 없다. npm run build가
// 이걸 먼저 돌리기 때문에 낡은 인덱스가 배포로 나가는 걸 여기서만 막을 수 있다.
// 시드가 없다고 build 자체를 세우면 그 배포가 아예 안 되므로, 없을 때는 할 수 있는
// 검사(생성물 자체)만 하고 넘어간다.
if (!fs.existsSync(SEED) || !fs.existsSync(SUPPORT_SEED)) {
  if (!CHECK_ONLY) {
    throw new Error(`시드를 찾을 수 없어 인덱스를 생성할 수 없다: ${SEED}`);
  }
  assertIndexUsable();
  console.warn(
    "생성물 검사만 통과했다. backend/sql이 없어 시드 대조는 건너뛴다." +
      " 시드와 일치하는지는 저장소 전체에서 `npm run check:region-index` 또는 `npm test`로 확인할 것.",
  );
  process.exit(0);
}

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
// 지역을 사람에게 보여줄 이름. 이 파일에서 이름을 적는 곳은 아래 진단 출력과
// index.names 둘뿐이고, 규칙이 갈라지면 검사 로그와 화면이 다른 이름을 부른다.
//
// 시도명을 앞에 붙인다. 우측 패널 제목에 쓰이는데 '서구'는 DB에 4곳, '동구'는 5곳이라
// 시군구 이름만으로는 어디인지 알 수 없다. 공유 링크로 바로 들어온 사용자는 특히 그렇다.
// 지도 배지는 도형 파일의 이름을 따로 쓰므로 여기 바꿔도 길어지지 않는다.
// 세종특별자치시처럼 시도와 지역 이름이 같으면 겹쳐 적지 않는다.
const displayName = (r) => (r.sido === r.name ? r.name : `${r.sido} ${r.name}`);

// 이름은 DB에 있는 지역 전부를 담는다. 도형이 없는 지역도 목록 제목에는 나올 수 있다.
const nameOf = new Map(db.map((r) => [r.code, displayName(r)]));
const missing = [...reachable].filter((c) => !mapped.has(c)).sort();

console.log(`도형 ${all.features.length}개 → 매칭 ${Object.keys(byShape).length}개`);
// 미매칭은 실패로 보지 않는다. 지금 3건은 전부 인천의 옛 경계다 — DB는 중구·동구를
// 제물포구·영종구로, 서구를 서해구·검단구로 나눈 개편을 반영했는데 도형 파일은 개편
// 전이다. 셋 다 인구감소지역이 아니고 어느 시드에도 없어 제도가 걸릴 수 없다.
// 걸리게 되면 아래 reachable 검사가 빌드를 세운다.
if (unmatched.length) {
  console.log(
    `\n도형에 대응하는 DB 지역이 없는 것 ${unmatched.length}개` +
      ` (개편 전 경계로 보인다 — 제도가 걸리면 아래 검사가 막는다):`,
  );
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

const index = {
  byShape,
  names: Object.fromEntries(nameOf),
  supportRegions: db.filter((r) => r.drop).map((r) => r.code),
};
const serialized = JSON.stringify(index) + "\n";

if (CHECK_ONLY) {
  assertIndexUsable();
  // 줄끝은 무시하고 내용만 본다. core.autocrlf=true인 환경에서 체크아웃하면
  // 이 파일이 CRLF로 풀려서, 내용이 같은데도 검사가 실패한다.
  const saved = fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n");
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
      ` — 도형 ${Object.keys(byShape).length} / 이름 ${nameOf.size}` +
      ` / 지원 대상 ${index.supportRegions.length}`,
  );
}
