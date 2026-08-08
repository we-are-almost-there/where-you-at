import { splitIntoSegments } from "../courseSegments";
import type { LatLng } from "../types";

const W = 169;
const H = 120;
const PAD = 24;

/** 코스 좌표를 카드 썸네일용 미니 폴리라인(SVG)으로 단순 렌더.
 *  padTop: 위쪽 여백. 뱃지가 얹히는 카드에서 경로가 뱃지에 가리지 않게 넓혀 쓴다. */
export function RoutePreview({ points, padTop = PAD }: { points: LatLng[]; padTop?: number }) {
  if (points.length < 2) return null;

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;

  const toXY = (p: LatLng) => {
    const x = PAD + ((p.lng - minLng) / spanLng) * (W - PAD * 2);
    // 위도는 위로 갈수록 커지므로 y축 반전
    const y = padTop + ((maxLat - p.lat) / spanLat) * (H - padTop - PAD);
    return [x, y] as const;
  };

  // 끊긴 구간(pen-up)을 직선으로 잇지 않도록 세그먼트별로 폴리라인을 그린다.
  const segments = splitIntoSegments(points);
  const [sx, sy] = toXY(points[0]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => toXY(p).join(",")).join(" ")}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      <circle cx={sx} cy={sy} r={5} fill="var(--color-start)" stroke="#fff" strokeWidth={2} />
    </svg>
  );
}
