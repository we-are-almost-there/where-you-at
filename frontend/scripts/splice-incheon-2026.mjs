// 지도 도형(public/korea-all-regions.json)에 2026-07-01 인천 행정체제 개편을 반영하고,
// 도형 코드(sgg_code)를 통계청 코드에서 행안부 코드로 바꾼 스크립트. (#77)
// 기준 도형에 있던 서구·부평구·미추홀구 경계의 꼬임도 함께 보정한다. (#101)
//
// ── 원본 ─────────────────────────────────────────────────────────────
// 1) 기준 도형: 이 변환 직전 main(BASE_REV)의 public/korea-all-regions.json
//    통계청 통계지리정보서비스(SGIS) 시군구 경계 BND_SIGUNGU_PG, 2025-06-30 기준, 공공누리 제1유형.
//    EPSG:4326 변환, 단순화(좌표 소수 2자리), 행정구의 시 단위 병합은 PR #32·#64에서 했다.
//    sgg_code는 SGIS 원본을 따라 통계청 코드였다.
// 2) 인천 새 경계: vuski/admdongkor ver20260701 행정동 경계
//    SGIS 행정동 경계(공공누리 제1유형)를 가공한 자료, CC BY 4.0.
//    https://github.com/vuski/admdongkor/blob/7360288277dfd12d74e54b959c59bdd66f852e3a/ver20260701/HangJeongDong_ver20260701.geojson
//    35MB라 저장소에 넣지 않는다. 받은 파일이 이 버전인지 sha256으로 확인한다.
// 3) 행안부 코드
//    - 인천 밖 226곳: 기준 시점 public/region-index.json의 byShape(통계청 → 행안부 대응표)
//    - 인천 새 4개 구: admdongkor의 sgg 속성(행안부 행정기관코드 앞 5자리)
//
// ── 가공 ─────────────────────────────────────────────────────────────
// 바깥 경계(이웃 시군구·바다와 맞닿은 선)는 기준 도형의 꼭짓점을 그대로 쓴다. 출처가 다른
// 경계를 섞으면 이웃 도형과 틈이나 겹침이 생기기 때문이다.
//   - 중구·동구 → 제물포구·영종구: 기준 도형의 조각을 새 구에 통째로 배정한다. 조각 안 격자점이
//     어느 구 행정동에 더 많이 들어가는지로 정하고, 겹치는 곳이 없으면 가까운 구로 보낸다
//     (옛 중구 북쪽 8.4km² 조각 → 영종구). 새 선은 생기지 않는다.
//   - 서구 → 서해구·검단구: admdongkor에서 두 구가 맞닿은 선(경인아라뱃길)을 뽑아 양 끝을 가장
//     가까운 서구 꼭짓점에 붙이고, 그 선으로 서구 외곽을 둘로 나눈다. 선의 안쪽 점은 기준 도형과
//     같은 소수 2자리로 반올림한다.
//   - 외곽 링은 반시계 방향, 구멍은 시계 방향(RFC 7946, 기준 도형과 같음).
//
// ── 기준 도형 꼬임 보정 (#101) ───────────────────────────────────────────
// 기준 도형은 좌표를 소수 2자리로 반올림하면서 서구 링 남쪽 끝이 8자로 꼬였다. 꼬인 아래쪽
// 삼각형(약 0.164km²)을 서구·부평구·미추홀구가 함께 가지고 있었다. 분할 전에 다음처럼 푼다.
//   - 서구 A→B→C→D 와 부평구 D→C→B 를, 꼬인 두 선분의 교점 X를 지나는 A→X→D, D→X→B 로 바꾼다.
//   - 미추홀구 B→A 에 X를 넣어 세 구가 X에서 만나게 한다. 서구 꼭짓점 M이 미추홀구 변 A→P
//     한가운데 놓여 두 구의 경계선이 달랐던 곳(T자 접합)에도 M을 넣는다. 둘 다 면적은 그대로다.
// 삼각형은 미추홀구에만 남는다. admdongkor 2026.7 행정동으로 보면 이 삼각형은 미추홀구 68%,
// 남동구 31%, 부평구 0.4%, 서구(서해구) 0%인데, 소수 2자리 격자에서는 미추홀구·남동구 사이의
// 경계점이 한 좌표로 뭉개져 나눌 수 없다. 가장 많이 겹치는 미추홀구에 몰아준 것은 웹 지도용
// 단순화에 따른 근사이고, 정확한 법정 경계가 아니다.
// X는 교점이라 소수 6자리(약 0.1m)로 둔다. 이 파일에서 소수 2자리가 아닌 유일한 좌표다.
//
// ── 실행 (frontend 폴더에서) ─────────────────────────────────────────
//   curl -L -o HangJeongDong_ver20260701.geojson https://raw.githubusercontent.com/vuski/admdongkor/7360288277dfd12d74e54b959c59bdd66f852e3a/ver20260701/HangJeongDong_ver20260701.geojson
//   node scripts/splice-incheon-2026.mjs HangJeongDong_ver20260701.geojson           도형 파일을 다시 쓴다
//   node scripts/splice-incheon-2026.mjs HangJeongDong_ver20260701.geojson --check   저장본과 같은지만 본다
//   npm run generate:region-index
// 한 번 적용하고 끝나는 변환이라 빌드·테스트에서는 돌리지 않는다. 기준 도형을 git 이력에서 읽는다.

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pc from "polygon-clipping";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, "..");
const OUT = path.join(FRONTEND, "public", "korea-all-regions.json");

const BASE_REV = "bb2405f8d4b5e98350191fac91a8c419122b7fe1";
const ADM_SHA256 = "c01ef44a0eb00978662ba7a6240ccb1da287fb52abd85104a1758969d391132f";

// 기준 도형의 통계청 코드
const OLD_JUNG = "23010";
const OLD_DONG = "23020";
const OLD_SEO = "23080";
const NAMDONG = "23050";
const BUPYEONG = "23060";
const MICHUHOL = "23090"; // 새 구를 이 뒤에 넣는다 (기존 파일의 코드 순서 유지)
// admdongkor에서 새 구의 행정동을 고를 때 쓰는 통계청 코드(adm_cd 앞 5자리)
const JEMULPO = "23100";
const YEONGJONG = "23110";
const GEOMDAN = "23120";
const SEOHAE = "23130";
const NEW_GU = [JEMULPO, YEONGJONG, GEOMDAN, SEOHAE];

const SHARED_KM = 0.02; // 두 구 경계가 맞닿았다고 볼 거리

// #101 보정 지점의 기준 도형 좌표 (위 "기준 도형 꼬임 보정" 설명의 이름과 같다)
const A = [126.67, 37.48];
const B = [126.69, 37.47];
const C = [126.68, 37.47];
const D = [126.69, 37.48];
const M = [126.66, 37.48];
const P = [126.65, 37.48];

// 고치지 않고 남겨 둔 자기교차. 결과 파일의 자기교차가 이 목록과 정확히 같아야 한다 —
// 다른 곳에 새로 생기거나, 같은 지역이라도 다른 선분이거나, 고쳐졌는데 목록에 남아 있으면 실패한다.
const KNOWN_SELF_INTERSECTIONS = [
  // 울산 동구: SGIS 원본을 소수 2자리로 반올림하며 생긴 꼬임. #101 범위 밖이라 남겨 둔다.
  { code: "31170", name: "동구", segments: [[[129.39, 35.53], [129.4, 35.51]], [[129.4, 35.52], [129.39, 35.52]]] },
];

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes("--check");
const admPath = args.find((a) => !a.startsWith("--"));
if (!admPath) {
  throw new Error("사용법: node scripts/splice-incheon-2026.mjs <HangJeongDong_ver20260701.geojson> [--check]");
}

const admRaw = fs.readFileSync(admPath);
const digest = crypto.createHash("sha256").update(admRaw).digest("hex");
if (digest !== ADM_SHA256) {
  throw new Error(`admdongkor 파일이 기록한 버전과 다르다 (sha256 ${digest})`);
}
const adm = JSON.parse(admRaw.toString("utf8"));

const fromBase = (file) =>
  JSON.parse(
    execFileSync("git", ["show", `${BASE_REV}:frontend/public/${file}`], {
      cwd: FRONTEND,
      maxBuffer: 1 << 28,
    }).toString("utf8"),
  );
const base = fromBase("korea-all-regions.json"); // 0단계에서 보정한다
const baseUnfixed = fromBase("korea-all-regions.json"); // 보정 전과 비교하는 검증용
const baseIndex = fromBase("region-index.json");

// ── 기하 유틸 ─────────────────────────────────────────────────────────
const polysOf = (g) => (g.type === "MultiPolygon" ? g.coordinates : [g.coordinates]);
// 경위도를 km로 근사한다. 인천 부근(북위 37.5도)만 다루므로 충분하다.
const KX = Math.cos((37.5 * Math.PI) / 180) * 111.32;
const KY = 111.32;

const counterClockwise = (r) => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return s > 0;
};
const ringKm2 = (r) => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    s += r[j][0] * KX * r[i][1] * KY - r[i][0] * KX * r[j][1] * KY;
  }
  return Math.abs(s) / 2;
};
const polyKm2 = (pl) => ringKm2(pl[0]) - pl.slice(1).reduce((a, h) => a + ringKm2(h), 0);
const areaKm2 = (ps) => ps.reduce((a, p) => a + polyKm2(p), 0);

const inRing = (p, r) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inPoly = (p, pl) => inRing(p, pl[0]) && !pl.slice(1).some((h) => inRing(p, h));
const inPolys = (p, ps) => ps.some((pl) => inPoly(p, pl));

const segKm = (p, a, b) => {
  const [ax, ay, bx, by, px, py] = [a[0] * KX, a[1] * KY, b[0] * KX, b[1] * KY, p[0] * KX, p[1] * KY];
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const distKm = (p, ps) => {
  let best = Infinity;
  for (const pl of ps) for (const r of pl) for (let i = 1; i < r.length; i++) best = Math.min(best, segKm(p, r[i - 1], r[i]));
  return best;
};

/** 폴리곤 bbox를 격자로 훑어 안에 들어가는 점들 */
function gridPoints(pl, n = 40) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pl[0]) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const out = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const p = [minX + ((maxX - minX) * i) / n, minY + ((maxY - minY) * j) / n];
      if (inPoly(p, pl)) out.push(p);
    }
  }
  return out;
}

const round2 = (v) => Math.round(v * 100) / 100;
const round6 = (v) => Math.round(v * 1e6) / 1e6;
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const dedupe = (pts) => pts.filter((p, i) => i === 0 || !same(p, pts[i - 1]));
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function selfIntersections(ring) {
  const n = ring.length - 1;
  const hits = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [p1, p2, p3, p4] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
      if (cross(p3, p4, p1) * cross(p3, p4, p2) < 0 && cross(p1, p2, p3) * cross(p1, p2, p4) < 0) hits.push([i, j]);
    }
  }
  return hits;
}
const segmentKey = (a, b) => [a, b].map((c) => c.join(",")).sort().join("|");
const hitKey = (s1, s2) => [segmentKey(...s1), segmentKey(...s2)].sort().join(" x ");

/** 점 p가 선분 a–b의 끝점이 아닌 안쪽에 놓이는지 (T자 접합 판정) */
function onSegmentInterior(p, a, b) {
  if (same(p, a) || same(p, b)) return false;
  const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len2;
  return Math.abs(cross(a, b, p)) / Math.sqrt(len2) < 1e-9 && t > 0 && t < 1;
}

/** 좌표 반올림(소수 6자리 — 격자 좌표는 그대로, 교점 X도 유지), 연속 중복 제거, 닫힌 링, 외곽 반시계·구멍 시계 */
const normalize = (ps) =>
  ps.map((pl) =>
    pl.map((ring, k) => {
      let r = dedupe(ring.map(([x, y]) => [round6(x), round6(y)]));
      if (!same(r[0], r[r.length - 1])) r.push(r[0]);
      if (counterClockwise(r) !== (k === 0)) r = r.reverse();
      return r;
    }),
  );
const toGeometry = (ps) =>
  ps.length === 1 ? { type: "Polygon", coordinates: ps[0] } : { type: "MultiPolygon", coordinates: ps };

// ── 입력 정리 ─────────────────────────────────────────────────────────
const featureOf = (fc, code) => {
  const f = fc.features.find((x) => x.properties.sgg_code === code);
  if (!f) throw new Error(`도형에 ${code}가 없다`);
  return f;
};
const baseFeature = (code) => featureOf(base, code);

// ── 0. 기준 도형 꼬임 보정 (#101) ─────────────────────────────────────────
/** 두 직선 p1–p2, p3–p4의 교점 */
function lineIntersection(p1, p2, p3, p4) {
  const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  const t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / d;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}
const X = lineIntersection(A, B, C, D).map(round6);

/** 닫힌 링에서 연속한 점 seq를 rep로 바꾼다. 링의 시작점은 원래대로 둔다. */
function replaceRun(ring, seq, rep, label) {
  const open = ring.slice(0, -1);
  const n = open.length;
  const s = open.findIndex((_, i) => seq.every((p, k) => same(open[(i + k) % n], p)));
  if (s < 0) throw new Error(`${label}: 보정할 점 ${JSON.stringify(seq)}을 찾지 못했다`);
  const rotated = [...open.slice(s), ...open.slice(0, s)];
  const next = [...rep, ...rotated.slice(seq.length)];
  const home = next.findIndex((p) => same(p, open[0]));
  const result = home < 0 ? next : [...next.slice(home), ...next.slice(0, home)];
  return [...result, result[0]];
}
const fixRing = (code, seq, rep) => {
  const g = baseFeature(code).geometry;
  if (g.type !== "Polygon" || g.coordinates.length !== 1) throw new Error(`${code}가 구멍 없는 단일 폴리곤이 아니다`);
  g.coordinates[0] = replaceRun(g.coordinates[0], seq, rep, code);
};
fixRing(OLD_SEO, [A, B, C, D], [A, X, D]);
fixRing(BUPYEONG, [D, C, B], [D, X, B]);
fixRing(MICHUHOL, [B, A, P], [B, X, A, M, P]);
console.log(`  #101 보정: 교점 X(${X.join(", ")})로 서구·부평구·미추홀구 경계 꼬임을 풀고, 미추홀구 변에 M(${M.join(", ")})을 넣음`);

const newGu = {};
for (const code of NEW_GU) {
  const dongs = adm.features.filter((f) => f.properties.adm_cd.startsWith(code));
  const names = new Set(dongs.map((f) => f.properties.sggnm));
  const moisCodes = new Set(dongs.map((f) => f.properties.sgg));
  if (!dongs.length || names.size !== 1 || moisCodes.size !== 1) {
    throw new Error(`admdongkor에서 ${code} 구를 하나로 특정하지 못했다: ${[...names]} / ${[...moisCodes]}`);
  }
  newGu[code] = {
    name: [...names][0],
    moisCode: [...moisCodes][0],
    polys: pc.union(...dongs.map((f) => polysOf(f.geometry))),
  };
}

// ── 1. 중구·동구 조각을 제물포구·영종구에 배정 ────────────────────────────
const assigned = { [JEMULPO]: [], [YEONGJONG]: [] };
const zone1Parts = [
  ...polysOf(baseFeature(OLD_JUNG).geometry).map((p, i) => ({ p, label: `중구 조각${i}` })),
  ...polysOf(baseFeature(OLD_DONG).geometry).map((p, i) => ({ p, label: `동구 조각${i}` })),
];
for (const { p, label } of zone1Parts) {
  const pts = gridPoints(p);
  const hits = Object.fromEntries(
    Object.keys(assigned).map((c) => [c, pts.filter((s) => inPolys(s, newGu[c].polys)).length]),
  );
  let to;
  if (hits[JEMULPO] + hits[YEONGJONG] > 0) {
    to = hits[JEMULPO] >= hits[YEONGJONG] ? JEMULPO : YEONGJONG;
  } else {
    const probe = pts[Math.floor(pts.length / 2)];
    to = distKm(probe, newGu[JEMULPO].polys) <= distKm(probe, newGu[YEONGJONG].polys) ? JEMULPO : YEONGJONG;
  }
  assigned[to].push(p);
  console.log(`  ${label} ${polyKm2(p).toFixed(2)}km² → ${newGu[to].name} (격자점 제물포 ${hits[JEMULPO]} / 영종 ${hits[YEONGJONG]})`);
}
const built = {};
for (const code of Object.keys(assigned)) built[code] = normalize(pc.union(...assigned[code]));

// ── 2. 서구를 검단구/서해구 경계선으로 분할 ──────────────────────────────
const seoGeom = baseFeature(OLD_SEO).geometry;
if (seoGeom.type !== "Polygon" || seoGeom.coordinates.length !== 1) {
  throw new Error("기준 서구가 구멍 없는 단일 폴리곤이 아니다");
}
const outline = seoGeom.coordinates[0].slice(0, -1); // 열린 링

const geomdanRing = newGu[GEOMDAN].polys.reduce((a, pl) => (ringKm2(pl[0]) > ringKm2(a[0]) ? pl : a))[0].slice(0, -1);
const touches = geomdanRing.map((p) => distKm(p, newGu[SEOHAE].polys) < SHARED_KM);
if (touches.every(Boolean) || !touches.some(Boolean)) throw new Error("검단구·서해구가 맞닿은 구간을 찾지 못했다");

// 링을 한 바퀴 돌며 맞닿은 점이 이어지는 구간을 모은다. 가장 긴 구간이 두 구의 경계선이다.
const runs = [];
let run = [];
const start = touches.indexOf(false);
for (let k = 1; k <= geomdanRing.length; k++) {
  const i = (start + k) % geomdanRing.length;
  if (touches[i]) run.push(geomdanRing[i]);
  else if (run.length) {
    runs.push(run);
    run = [];
  }
}
if (run.length) runs.push(run);
const line = runs.reduce((a, b) => (b.length > a.length ? b : a));

const nearestVertex = (p) =>
  outline.reduce((best, q, i) => (segKm(p, q, q) < segKm(p, outline[best], outline[best]) ? i : best), 0);
const i0 = nearestVertex(line[0]);
const i1 = nearestVertex(line[line.length - 1]);
if (i0 === i1) throw new Error("경계선 두 끝이 서구의 같은 꼭짓점에 붙었다");
const inner = dedupe(line.slice(1, -1).map(([x, y]) => [round2(x), round2(y)])).filter(
  (p) => !same(p, outline[i0]) && !same(p, outline[i1]),
);
console.log(
  `  검단·서해 경계선 ${line.length}점 → 서구 꼭짓점 #${i0}(${segKm(line[0], outline[i0], outline[i0]).toFixed(2)}km)` +
    `–#${i1}(${segKm(line.at(-1), outline[i1], outline[i1]).toFixed(2)}km), 안쪽 점 ${inner.length}개`,
);

const walk = (a, b) => {
  const out = [];
  for (let k = a; ; k = (k + 1) % outline.length) {
    out.push(outline[k]);
    if (k === b) break;
  }
  return out;
};
const ringA = [...walk(i0, i1), ...[...inner].reverse(), outline[i0]];
const ringB = [...walk(i1, i0), ...inner, outline[i1]];
const geomdanShare = (r) => {
  const pts = gridPoints([r]);
  return pts.filter((p) => inPolys(p, newGu[GEOMDAN].polys)).length / pts.length;
};
const [geomdan, seohae] = geomdanShare(ringA) >= geomdanShare(ringB) ? [ringA, ringB] : [ringB, ringA];
built[GEOMDAN] = normalize([[geomdan]]);
built[SEOHAE] = normalize([[seohae]]);

for (const code of [GEOMDAN, SEOHAE]) {
  const hits = selfIntersections(built[code][0][0]);
  if (hits.length) throw new Error(`${newGu[code].name} 링이 자기 자신과 교차한다 (${hits.length}건)`);
}

// ── 3. 검증: 옛 영역과 새 영역이 정확히 같은지 ────────────────────────────
const oldZone = (codes) => pc.union(...codes.map((c) => polysOf(baseFeature(c).geometry)));
const newZone = (codes) => pc.union(...codes.map((c) => built[c]));
for (const [label, olds, news] of [
  ["중구+동구 / 제물포구+영종구", [OLD_JUNG, OLD_DONG], [JEMULPO, YEONGJONG]],
  ["서구(보정 후) / 검단구+서해구", [OLD_SEO], [GEOMDAN, SEOHAE]],
]) {
  const diff = areaKm2(pc.xor(oldZone(olds), newZone(news)));
  console.log(`  ${label}: ${areaKm2(oldZone(olds)).toFixed(1)}km², 차이 ${diff.toFixed(4)}km²`);
  if (diff > 0.001) throw new Error(`${label} 영역이 달라졌다`);
}
if (areaKm2(pc.intersection(built[GEOMDAN], built[SEOHAE])) > 0.001) throw new Error("검단구와 서해구가 겹친다");

// ── 4. 조립: 행안부 코드로 바꾸고 인천 3개를 4개로 교체 ────────────────────
const removed = new Set([OLD_JUNG, OLD_DONG, OLD_SEO]);
const features = [];
for (const f of base.features) {
  const kostat = f.properties.sgg_code;
  if (removed.has(kostat)) continue;
  const mois = baseIndex.byShape[kostat];
  if (!mois) throw new Error(`기준 대응표에 ${kostat} ${f.properties.name}의 행안부 코드가 없다`);
  features.push({ type: "Feature", properties: { sgg_code: mois, name: f.properties.name }, geometry: f.geometry });
  if (kostat === MICHUHOL) {
    for (const code of NEW_GU) {
      features.push({
        type: "Feature",
        properties: { sgg_code: newGu[code].moisCode, name: newGu[code].name },
        geometry: toGeometry(built[code]),
      });
    }
  }
}
const codes = features.map((f) => f.properties.sgg_code);
if (new Set(codes).size !== codes.length) throw new Error("sgg_code가 중복된다");
if (features.length !== base.features.length + 1) throw new Error(`도형 수가 ${features.length}개다`);
const result = { type: "FeatureCollection", features };

// ── 5. 검증: #101 보정 지점의 네 구 ────────────────────────────────────────
// 겹침만 보면 영역을 잘못 지워 틈이 생겨도 통과하므로, 보정 전후 합집합이 같은지도 본다.
// 공유 꼭짓점이 같아도 한쪽 변 한가운데에 다른 쪽 꼭짓점이 놓이면(T자 접합) 경계선이 다르므로 그것도 본다.
const AROUND = {
  [newGu[SEOHAE].moisCode]: "서해구",
  [baseIndex.byShape[BUPYEONG]]: "부평구",
  [baseIndex.byShape[MICHUHOL]]: "미추홀구",
  [baseIndex.byShape[NAMDONG]]: "남동구",
};
const aroundCodes = Object.keys(AROUND);
const shapeOf = (code) => polysOf(featureOf(result, code).geometry);
const problems = [];

for (let i = 0; i < aroundCodes.length; i++) {
  for (let j = i + 1; j < aroundCodes.length; j++) {
    const overlap = areaKm2(pc.intersection(shapeOf(aroundCodes[i]), shapeOf(aroundCodes[j])));
    if (overlap >= 0.001) problems.push(`${AROUND[aroundCodes[i]]}·${AROUND[aroundCodes[j]]}가 ${overlap.toFixed(6)}km² 겹친다`);
  }
}

// 보정 전(기준 도형)의 서구에는 검단구 영역이 들어 있으므로, 보정 후 쪽에 검단구를 더해 같은 범위를 비교한다
const before = pc.union(...[OLD_SEO, BUPYEONG, MICHUHOL, NAMDONG].map((c) => polysOf(featureOf(baseUnfixed, c).geometry)));
const after = pc.union(...[...aroundCodes, newGu[GEOMDAN].moisCode].map(shapeOf));
const unionDiff = areaKm2(pc.xor(before, after));
if (unionDiff >= 0.001) problems.push(`보정 전후 네 구(+검단구) 합집합이 ${unionDiff.toFixed(6)}km² 다르다`);

const ringsOf = (code) => shapeOf(code).flat();
for (const c1 of aroundCodes) {
  const vertices = ringsOf(c1).flatMap((r) => r.slice(0, -1));
  for (const c2 of aroundCodes) {
    if (c1 === c2) continue;
    for (const r of ringsOf(c2)) {
      for (let k = 0; k < r.length - 1; k++) {
        for (const p of vertices) {
          if (onSegmentInterior(p, r[k], r[k + 1])) {
            problems.push(`${AROUND[c1]} 꼭짓점 ${p}가 ${AROUND[c2]} 변 ${r[k]}–${r[k + 1]} 가운데에 있다`);
          }
        }
      }
    }
  }
}
console.log(`  #101 검증: 네 구 쌍별 겹침·합집합 차이(${unionDiff.toFixed(6)}km²)·T자 접합`);

// ── 6. 검증: 전국 자기교차가 허용 목록과 정확히 같은지 ─────────────────────
const allowed = new Map(
  KNOWN_SELF_INTERSECTIONS.map((k) => [`${k.code} ${hitKey(...k.segments)}`, `${k.code} ${k.name}`]),
);
const found = new Set();
for (const f of features) {
  for (const r of polysOf(f.geometry).flat()) {
    for (const [a, b] of selfIntersections(r)) {
      const key = `${f.properties.sgg_code} ${hitKey([r[a], r[a + 1]], [r[b], r[b + 1]])}`;
      found.add(key);
      if (!allowed.has(key)) problems.push(`허용 목록에 없는 자기교차: ${f.properties.sgg_code} ${f.properties.name} ${key}`);
    }
  }
}
for (const [key, label] of allowed) {
  if (!found.has(key)) problems.push(`KNOWN_SELF_INTERSECTIONS의 ${label} 교차가 더는 없다 — 목록에서 지울 것`);
}
console.log(`  전국 자기교차 ${found.size}건 (허용 목록 ${allowed.size}건)`);

if (problems.length) {
  for (const p of problems) console.error(`  실패: ${p}`);
  process.exit(1);
}

const serialized = JSON.stringify(result);
if (CHECK_ONLY) {
  if (fs.readFileSync(OUT, "utf8") !== serialized) {
    console.error("\npublic/korea-all-regions.json이 이 스크립트 결과와 다르다.");
    process.exit(1);
  }
  console.log(`\n저장된 public/korea-all-regions.json이 스크립트 결과와 같다 (도형 ${features.length}개).`);
} else {
  fs.writeFileSync(OUT, serialized);
  console.log(`\n생성: public/korea-all-regions.json (도형 ${features.length}개, ${fs.statSync(OUT).size} bytes)`);
}
