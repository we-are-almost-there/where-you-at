import { useState, useMemo, useEffect } from "react";
import type { FeatureCollection, Feature } from "geojson";
import { useSearchParams } from "react-router";

const WIDTH = 700;
const HEIGHT = 800;
const PAD = 20;

// 지원 지역이 있는 시도코드 (앞 2자리) — 이 시도만 전국뷰에서 활성
const ACTIVE_SIDO = new Set([
  "12", "26", "27", "28", "41", "43", "44", "47", "48", "51", "52",
]);

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


export function SupportRegionMap() {
  const [, setSearchParams] = useSearchParams();
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

  // 현재 뷰 대상의 경위도 범위에 맞춰 projection 계산 (전국이든 시도든)
  const project = useMemo(() => {
    if (!viewFeatures.length) return null;
    let minLng = 999, maxLng = -999, minLat = 999, maxLat = -999;
    viewFeatures.forEach((f) => {
      const g: any = f.geometry;
      const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
      polys.forEach((poly: number[][][]) =>
        poly.forEach((ring) =>
          ring.forEach(([lng, lat]) => {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }),
        ),
      );
    });
    const w = WIDTH - PAD * 2;
    const h = HEIGHT - PAD * 2;
    const scale = Math.min(w / (maxLng - minLng), h / (maxLat - minLat));
    const offX = PAD + (w - scale * (maxLng - minLng)) / 2;
    const offY = PAD + (h - scale * (maxLat - minLat)) / 2;
    return ([lng, lat]: number[]): [number, number] => [
      offX + (lng - minLng) * scale,
      offY + (maxLat - lat) * scale,
    ];
  }, [viewFeatures, selectedSido]);

  const toPath = (geom: any, proj: (p: number[]) => [number, number]): string => {
    const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
    return polys
      .map((poly: number[][][]) =>
        poly
          .map((ring: number[][]) =>
            ring.map((pt, i) => {
              const [x, y] = proj(pt);
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            }).join("") + "Z",
          )
          .join(""),
      )
      .join("");
  };

  // 시도 뷰 배지 위치 (중심 좌표)
  const badges = useMemo(() => {
    if (!project) return [];
    // 전국 뷰: 활성 시도 배지 / 시도 뷰: 시군구 배지
    const src = selectedSido == null
      ? (sido?.features ?? []).filter((f) => ACTIVE_SIDO.has((f.properties as any).sido_code))
      : badgeFeatures;
    return src.map((f) => {
      const g: any = f.geometry;
      const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
      // 가장 큰 폴리곤의 중심 (작은 섬 말고 본체에 배지)
      let best = polys[0], bestLen = 0;
      polys.forEach((poly: number[][][]) => {
        if (poly[0].length > bestLen) { bestLen = poly[0].length; best = poly; }
      });
      let sx = 0, sy = 0, n = 0;
      best[0].forEach(([lng, lat]: number[]) => {
        const [x, y] = project([lng, lat]);
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

  // 배지 충돌 해소 (전국·시도 공통)
  const badgePositions = useMemo(() => {
    if (!badges.length) return [];
    const BADGE_W = selectedSido == null ? 150 : 60;  // 전국뷰는 풀네임이라 넓게
    const BADGE_H = 50;
    const nodes = badges.map((b) => ({ ...b, x: b.cx, y: b.cy, ox: b.cx, oy: b.cy }));

    for (let iter = 0; iter < 300; iter++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const ox = BADGE_W - Math.abs(dx);
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
      if (!moved) break;
    }
    return nodes;
  }, [badges, selectedSido]);

  if (error) return <p className="py-4 text-sm text-rose-600">{error}</p>;
  if (!sido || !support) return <p className="py-4 text-sm text-slate-400">지도를 불러오는 중…</p>;

  const selectedSidoName =
    selectedSido != null
      ? (sido.features.find((f) => (f.properties as any).sido_code === selectedSido)
          ?.properties as any)?.sido_name
      : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-2">
      {/* 헤더 / 뒤로 */}
      <div className="mb-2 flex items-center gap-2">
        {selectedSido != null && (
          <button
            onClick={() => {
              setSelectedSido(null);
              setHovered(null);
            }}
            className="text-[13px] text-slate-400 hover:text-slate-600"
          >
            ← 전국으로
          </button>
        )}
        <span className="text-sm font-bold text-indigo-950">
          {selectedSido == null ? "지역을 선택하세요" : selectedSidoName}
        </span>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full">
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
                      ? "#6C5CE7"
                      : active
                        ? SIDO_COLOR[code] ?? "#C9B8F0"
                        : "#F1EFF7"
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
            // 시도 뷰: 시군구 폴리곤
            const code = String(props.region_code);
            return (
              <path
                key={code}
                d={toPath(f.geometry, project)}
                fill={hovered === code ? "#6C5CE7" : "#C9B8F0"}
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
              stroke="#C9B8F0"
              strokeWidth={0.8}
            />
          ) : null;
        })}

        {/* 배지 (전국뷰=시도, 시도뷰=시군구) */}
        {badgePositions.map((b) => (
          <foreignObject
            key={`badge-${b.code}`}
            x={b.x - 45}
            y={b.y - 11}
            width={90}
            height={22}
            style={{ overflow: "visible" }}
          >
            <button
              onClick={() =>
                selectedSido == null
                  ? setSelectedSido(b.code)
                  : setSearchParams({ region: b.code })
              }
              onMouseEnter={() => setHovered(b.code)}
              onMouseLeave={() => setHovered(null)}
              className={`flex items-center justify-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold shadow-sm transition-colors ${
                hovered === b.code
                  ? "bg-violet-600 text-white"
                  : "bg-white text-indigo-950 ring-1 ring-violet-200"
              }`}
            >
              {b.name}
              <span className="text-violet-400">›</span>
            </button>
          </foreignObject>
        ))}
      </svg>
    </div>
  );
}