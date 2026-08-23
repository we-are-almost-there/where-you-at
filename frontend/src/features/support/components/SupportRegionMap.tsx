import { useState, useMemo, useEffect, useRef } from "react";
import type { FeatureCollection, Feature } from "geojson";
import { useSearchParams } from "react-router";

// viewBox는 고정하지 않고 그리는 대상의 비율에 맞춰 뷰마다 계산한다.
// 고정하면 가로로 긴 도(강원 등)에서 위아래에 큰 죽은 여백이 생긴다.
// VIEW_BASE는 긴 변의 크기(패딩 제외) — 좌표 정밀도 기준일 뿐 화면 크기와는 무관하다.
const VIEW_BASE = 780;
const PAD = 10;

// 지원 지역이 있는 시도코드 (앞 2자리) — 이 시도만 전국뷰에서 활성
const ACTIVE_SIDO = new Set([
  "12", "26", "27", "28", "41", "43", "44", "47", "48", "51", "52",
]);

const COLOR_HOVER = "#6C5CE7"; // --color-accent (SVG fill이라 토큰 클래스 대신 값으로)
const COLOR_INACTIVE = "#F1EFFC"; // --color-lavender
const COLOR_SIGUNGU = "#C9B8F0"; // 시도 색을 못 찾았을 때의 폴백 채움

// 본토를 크게 그리기 위한 인셋. 전국뷰 bbox가 울릉도(130.9°E)·백령도(124.6°E)·
// 제주(33.1°N) 때문에 부풀어서, 본토가 실제로 쓸 수 있는 폭의 3분의 2로 그려지고 있었다.
// 창(WINDOW) 안쪽 좌표는 손대지 않고, 밖으로 나간 거리만 압축해 창 쪽으로 붙인다.
// 종이 지도가 울릉도·제주를 인셋 박스로 빼는 것과 같은 관례 — 지리 비율은 의도적으로 포기한다.
// 압축률은 경도·위도를 따로 둔다. 좌우(울릉도·백령도)는 세게 당겨 가로 낭비를 줄이고,
// 제주는 약하게 당겨 본토와 충분히 떨어진 남쪽에 남긴다.
const WINDOW_LNG: [number, number] = [125.6, 129.7];
const WINDOW_LAT: [number, number] = [34.2, 38.7];
const INSET_COMPRESS_LNG = 0.16;
const INSET_COMPRESS_LAT = 0.5;

// 등장방형 보정. 위도 36°(본토 중심)에서 경도 1°는 위도 1°의 약 0.81배 거리라,
// 보정하지 않으면 본토가 가로로 1.2배 늘어난다.
const COS_LAT0 = Math.cos((36 * Math.PI) / 180);

function clampToWindow(v: number, [lo, hi]: [number, number], compress: number): number {
  if (v < lo) return lo + (v - lo) * compress;
  if (v > hi) return hi + (v - hi) * compress;
  return v;
}

/**
 * 폴리곤을 인셋 규칙에 맞춰 옮긴 링 배열로 편다.
 * 좌표를 하나씩 압축하면 섬 모양이 찌그러지므로, 폴리곤 중심의 이동량만큼
 * 링 전체를 평행이동해 모양과 구멍 정렬을 그대로 유지한다.
 * bbox 계산과 path 생성이 반드시 같은 함수를 거쳐야 좌표계가 어긋나지 않는다.
 */
function insetRings(geom: any): number[][][] {
  const polys: number[][][][] =
    geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  const rings: number[][][] = [];
  for (const poly of polys) {
    const shell = poly[0];
    let sx = 0, sy = 0;
    for (const [lng, lat] of shell) { sx += lng; sy += lat; }
    const cx = sx / shell.length;
    const cy = sy / shell.length;
    const dLng = clampToWindow(cx, WINDOW_LNG, INSET_COMPRESS_LNG) - cx;
    const dLat = clampToWindow(cy, WINDOW_LAT, INSET_COMPRESS_LAT) - cy;
    if (dLng === 0 && dLat === 0) {
      for (const ring of poly) rings.push(ring);
    } else {
      for (const ring of poly) rings.push(ring.map(([lng, lat]) => [lng + dLng, lat + dLat]));
    }
  }
  return rings;
}

// 시도별 색상 (활성 시도만)
const SIDO_COLOR: Record<string, string> = {
  "41": "#A9C7F5", // 경기 - 파랑
  "51": "#7FD1C4", // 강원 - 청록
  "43": "#C4A9E8", // 충북 - 보라
  "44": "#F5B8D0", // 충남 - 분홍
  "52": "#A9E0A0", // 전북 - 연두
  "12": "#F5C98F", // 전남 - 주황
  "47": "#F5A9A9", // 경북 - 살구
  "48": "#B8D98F", // 경남 - 올리브
  "28": "#8FC9F5", // 인천 - 하늘
  "26": "#F5E08F", // 부산 - 노랑
  "27": "#D9A0D9"  // 대구 - 자주
};


// 배지의 화면상 글자 크기(CSS px). viewBox가 축소돼도 이 크기를 유지한다.
const BADGE_FONT_PX = 12;
// 충돌 간격 박스 높이 (글자 크기 배수 — 폰트만 바꾸면 같이 따라온다).
// 배지 높이(약 2em)보다 넉넉히 잡아야 대구처럼 다른 도 안에 들어앉은 시가
// 모도(경북) 라벨과 붙어 보이지 않는다.
const BADGE_H_EM = 5.5;
// 배지 폭은 이름 길이로 각자 계산한다. 전부 같은 폭으로 잡으면 '고성군' 같은 짧은 이름이
// '전남광주통합특별시' 기준으로 밀려나 필요 이상으로 흩어진다.
const badgeWidthEm = (name: string) => name.length + 1.8;

export function SupportRegionMap() {
  const [, setSearchParams] = useSearchParams();
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [svgPxWidth, setSvgPxWidth] = useState(VIEW_BASE);
  const [sido, setSido] = useState<FeatureCollection | null>(null);
  const [support, setSupport] = useState<FeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedSido, setSelectedSido] = useState<string | null>(null); // null=전국

  useEffect(() => {
    Promise.all([
      fetch("/korea-sido.json").then((r) => r.json()),
      fetch("/support-regions-geo.json").then((r) => {
        if (!r.ok) throw new Error(`지도 로드 실패 (${r.status})`);
        return r.json();
      }),
    ])
      .then(([sd, sp]) => {
        setSido(sd);
        setSupport(sp);
      })
      .catch((err) => setError(err.message));
  }, []);

  // SVG가 실제로 몇 CSS px로 그려지는지 추적한다.
  // foreignObject 안의 px는 viewBox 단위라 화면 축소 배율만큼 같이 작아지는데,
  // 배지 글자는 지도와 같이 작아지면 안 되므로 이 값으로 역보정한다.
  // ResizeObserver의 contentRect는 SVG에서 신뢰할 수 없어 항상 rect를 직접 읽는다.
  // 컨테이너와 svg를 모두 관찰하고 window resize까지 듣는다 — 셋 중 하나만 놓쳐도
  // 배지 크기가 이전 화면 폭에 멈춰버린다.
  useEffect(() => {
    const measure = () => {
      const w = svgRef.current?.getBoundingClientRect().width ?? 0;
      // 같은 값이면 setState가 바로 빠져나가므로 렌더 루프가 생기지 않는다
      setSvgPxWidth((prev) => (w > 0 && Math.abs(prev - w) > 0.5 ? w : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (boxRef.current) ro.observe(boxRef.current);
    if (svgRef.current) ro.observe(svgRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  });

  // 현재 뷰에서 그릴 feature들
  const { viewFeatures, badgeFeatures } = useMemo(() => {
    if (selectedSido == null) {
      // 전국 뷰: 시도 경계, 배지 없음
      return { viewFeatures: sido?.features ?? [], badgeFeatures: [] as Feature[] };
    }
    // 시도 뷰: 그 도의 지원 지역만
    const inSido = (support?.features ?? []).filter(
      (f) => String((f.properties as any).region_code).slice(0, 2) === selectedSido,
    );
    return { viewFeatures: inSido, badgeFeatures: inSido };
  }, [selectedSido, sido, support]);

  // 현재 뷰 대상의 경위도 범위에 맞춰 projection 계산 (전국이든 시도든).
  // 인셋을 적용한 좌표 기준으로 bbox를 잡으므로, project에 넘기는 좌표도
  // 반드시 insetRings를 통과한 값이어야 한다.
  const { project, viewW, viewH } = useMemo(() => {
    if (!viewFeatures.length) {
      return { project: null, viewW: VIEW_BASE, viewH: VIEW_BASE };
    }
    let minX = Infinity, maxX = -Infinity, minLat = Infinity, maxLat = -Infinity;
    viewFeatures.forEach((f) => {
      insetRings(f.geometry).forEach((ring) =>
        ring.forEach(([lng, lat]) => {
          const x = lng * COS_LAT0;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }),
      );
    });
    const dX = maxX - minX;
    const dY = maxLat - minLat;
    // 긴 변을 VIEW_BASE에 맞추고, 짧은 변은 비율대로 — viewBox가 콘텐츠에 딱 맞으니 여백이 없다
    const scale = VIEW_BASE / Math.max(dX, dY);
    const proj = ([lng, lat]: number[]): [number, number] => [
      PAD + (lng * COS_LAT0 - minX) * scale,
      PAD + (maxLat - lat) * scale,
    ];
    return {
      project: proj,
      viewW: dX * scale + PAD * 2,
      viewH: dY * scale + PAD * 2,
    };
  }, [viewFeatures]);

  // viewBox 단위 / CSS px. 모바일처럼 지도가 작게 그려질수록 1보다 커진다.
  const unitPerPx = viewW / svgPxWidth;
  const badgeFont = BADGE_FONT_PX * unitPerPx;

  const toPath = (geom: any, proj: (p: number[]) => [number, number]): string =>
    insetRings(geom)
      .map(
        (ring) =>
          ring.map((pt, i) => {
            const [x, y] = proj(pt);
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          }).join("") + "Z",
      )
      .join("");

  // 시도 뷰 배지 위치 (중심 좌표)
  const badges = useMemo(() => {
    if (!project) return [];
    // 전국 뷰: 활성 시도 배지 / 시도 뷰: 시군구 배지
    const src = selectedSido == null
      ? (sido?.features ?? []).filter((f) => ACTIVE_SIDO.has((f.properties as any).sido_code))
      : badgeFeatures;
    return src.map((f) => {
      const rings = insetRings(f.geometry);
      // 가장 큰 링의 중심 (작은 섬 말고 본체에 배지)
      let best = rings[0];
      for (const ring of rings) if (ring.length > best.length) best = ring;
      let sx = 0, sy = 0, n = 0;
      best.forEach((pt) => {
        const [x, y] = project(pt);
        sx += x; sy += y; n++;
      });
      const props = f.properties as any;
      return {
        code: selectedSido == null ? props.sido_code : String(props.region_code),
        name: selectedSido == null ? props.sido_name : props.name,
        cx: sx / n,
        cy: sy / n,
      };
    });
  }, [selectedSido, sido, badgeFeatures, project]);

  // 배지 충돌 해소 (전국·시도 공통).
  // 배지가 화면상 고정 크기라 viewBox 단위 크기는 축소 배율만큼 커진다 — 간격도 같이 키운다.
  const badgePositions = useMemo(() => {
    if (!badges.length) return [];
    const BADGE_H = BADGE_H_EM * badgeFont;
    const nodes = badges.map((b) => ({
      ...b,
      x: b.cx, y: b.cy, ox: b.cx, oy: b.cy,
      halfW: (badgeWidthEm(b.name) * badgeFont) / 2,
    }));

    for (let iter = 0; iter < 300; iter++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          // 두 배지의 반폭 합만큼만 떨어지면 된다
          const ox = a.halfW + b.halfW - Math.abs(dx);
          const oy = BADGE_H - Math.abs(dy);
          if (ox > 0 && oy > 0) {
            if (ox < oy) {
              const push = (ox / 2) * (dx < 0 ? -1 : 1);
              a.x -= push; b.x += push;
            } else {
              const push = (oy / 2) * (dy < 0 ? -1 : 1);
              a.y -= push; b.y += push;
            }
            moved = true;
          }
        }
      }
      // 경계 가두기를 반복 안에서 함께 한다. 마지막에 한 번만 하면 되밀린 배지가
      // 다시 겹친 채로 끝난다.
      const halfH = BADGE_H / 2;
      for (const n of nodes) {
        n.x = Math.min(Math.max(n.x, n.halfW), viewW - n.halfW);
        n.y = Math.min(Math.max(n.y, halfH), viewH - halfH);
      }
      if (!moved) break;
    }
    return nodes;
  }, [badges, badgeFont, viewW, viewH]);

  if (error) return <p className="py-16 text-center text-[14px] text-caption">{error}</p>;
  if (!sido || !support)
    return <p className="py-16 text-center text-[14px] text-caption">지도를 불러오는 중…</p>;

  const selectedSidoName =
    selectedSido != null
      ? (sido.features.find((f) => (f.properties as any).sido_code === selectedSido)
          ?.properties as any)?.sido_name
      : null;

  // 시도 뷰에서 쓸 그 도의 색 (시군구 채움·배지 연결선에 공통 적용)
  const sidoColor = (selectedSido && SIDO_COLOR[selectedSido]) || COLOR_SIGUNGU;

  return (
    /* 칩은 바깥(컬럼 폭) 기준, 지도는 안쪽(mx-auto)에서 가운데 —
       한 박스에 두면 칩이 지도를 따라 가운데로 끌려간다. */
    <div ref={boxRef} className="relative w-full">
      {/* 헤더 / 뒤로 — 바다 위라 유리판 칩으로 대비 확보. 좌측은 제목 칩과 같은 선에 맞춘다.
          모바일은 지도가 작아 띄우면 상단 시군구 배지를 가리므로 일반 흐름에 두어
          지도를 칩 높이만큼만 밀어낸다. md+는 여유가 있어 그대로 띄운다. */}
      <div className="mb-2 flex w-fit items-center gap-2 rounded-lg bg-white/65 px-3.5 py-1.5 ring-1 ring-white/70 backdrop-blur-sm md:absolute md:left-0 md:top-0 md:z-10 md:mb-0">
        {selectedSido != null && (
          <button
            type="button"
            onClick={() => {
              setSelectedSido(null);
              setHovered(null);
              // 지도만 전국으로 돌리고 URL을 그대로 두면, 전국뷰인데 우측에는
              // 직전에 고른 시군구 패널이 그대로 남는다. region·support를 함께 비운다.
              setSearchParams({});
            }}
            className="cursor-pointer text-[13px] text-caption transition-colors hover:text-ink"
          >
            ← 전국으로
          </button>
        )}
        <span className="text-[15px] font-bold text-ink">
          {selectedSido == null ? "지역을 선택하세요" : selectedSidoName}
        </span>
      </div>

      {/* 배경은 페이지 전체에 깔린 SeaBackdrop이 담당하므로 지도 자체는 투명하다 */}
      <div className="mx-auto w-full max-w-3xl px-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewW.toFixed(1)} ${viewH.toFixed(1)}`}
        className="h-auto w-full"
      >
        {project &&
          viewFeatures.map((f) => {
            const props = f.properties as any;
            if (selectedSido == null) {
              // 전국 뷰: 시도 폴리곤
              const code = props.sido_code;
              const active = ACTIVE_SIDO.has(code);
              return (
                <path
                  key={code}
                  d={toPath(f.geometry, project)}
                  fill={
                    hovered === code
                      ? COLOR_HOVER
                      : active
                        ? SIDO_COLOR[code] ?? COLOR_SIGUNGU
                        : COLOR_INACTIVE
                  }
                  stroke="#fff"
                  strokeWidth={0.8}
                  className={active ? "cursor-pointer transition-colors" : ""}
                  onMouseEnter={() => active && setHovered(code)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => active && setSelectedSido(code)}
                />
              );
            }
            // 시도 뷰: 시군구 폴리곤 — 전국뷰에서 그 시도가 갖고 있던 색을 그대로 이어받아,
            // 어느 도를 파고든 건지 색으로 알 수 있게 한다.
            const code = String(props.region_code);
            return (
              <path
                key={code}
                d={toPath(f.geometry, project)}
                fill={hovered === code ? COLOR_HOVER : sidoColor}
                stroke="#fff"
                strokeWidth={0.6}
                className="cursor-pointer transition-colors"
                onMouseEnter={() => setHovered(code)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSearchParams({ region: code })}
              />
            );
          })}

        {/* 밀려난 배지 연결선 */}
        {badgePositions.map((b) => {
          const dist = Math.hypot(b.x - b.ox, b.y - b.oy);
          return dist > 10 ? (
            <line
              key={`line-${b.code}`}
              x1={b.x}
              y1={b.y}
              x2={b.ox}
              y2={b.oy}
              stroke={sidoColor}
              strokeWidth={0.8 * unitPerPx}
            />
          ) : null;
        })}

        {/* 배지 (전국뷰=시도, 시도뷰=시군구) — 크기는 viewBox가 아니라 화면 기준으로 고정 */}
        {badgePositions.map((b) => (
          <foreignObject
            key={`badge-${b.code}`}
            x={b.x - b.halfW}
            y={b.y - 0.75 * badgeFont}
            width={b.halfW * 2}
            height={1.5 * badgeFont}
            style={{ overflow: "visible" }}
          >
            {/* 알약은 글자 폭에 딱 맞게(inline-flex) 두고, 이 래퍼가 기준점에 정확히 가운데 맞춘다.
                버튼을 foreignObject의 직접 자식으로 두면 폭이 추정치로 늘어나 좌우가 어긋난다. */}
            <div className="flex h-full w-full items-center justify-center">
              <button
                type="button"
                onClick={() =>
                  selectedSido == null
                    ? setSelectedSido(b.code)
                    : setSearchParams({ region: b.code })
                }
                onMouseEnter={() => setHovered(b.code)}
                onMouseLeave={() => setHovered(null)}
                // 패딩·모서리를 em으로 두어 글자 크기 한 곳만 바꾸면 통째로 따라 커진다
                style={{ fontSize: `${badgeFont}px` }}
                className={`inline-flex cursor-pointer items-center gap-[0.15em] whitespace-nowrap rounded-full px-[0.65em] py-[0.2em] font-bold shadow-[0px_1px_4px_0px_rgba(0,0,0,0.18)] transition-colors ${
                  hovered === b.code ? "bg-accent text-white" : "bg-white text-ink"
                }`}
              >
                {b.name}
                <span className={hovered === b.code ? "text-white/70" : "text-caption"}>›</span>
              </button>
            </div>
          </foreignObject>
        ))}
      </svg>
      </div>
    </div>
  );
}