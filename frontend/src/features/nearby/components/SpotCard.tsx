import type { NearbySpot } from "../types";

interface Props {
  spot: NearbySpot;
  routeType: "trail" | "bicycle";
  onSelect: (spot: NearbySpot) => void;
}

export function SpotCard({ spot, routeType, onSelect }: Props) {
  const distanceLabel = spot.distance_m >= 1000 ? `${(spot.distance_m / 1000).toFixed(1)}km` : `${spot.distance_m}m`;
  const modeLabel = routeType === "bicycle" ? "자전거" : "도보";

  return (
    <button
      type="button"
      onClick={() => onSelect(spot)}
      className="flex flex-col overflow-hidden rounded-xl bg-white text-left shadow-[0px_3px_10px_0px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0px_5px_16px_0px_rgba(0,0,0,0.16)]"
    >
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-lavender">
        {spot.image_url ? (
          <img src={spot.image_url} alt={spot.name} className="h-full w-full object-cover" />
        ) : (
          <>
            <span className="text-[24px]" aria-hidden="true">
              🖼️
            </span>
            <span className="text-[12px] text-caption">준비중이에요</span>
          </>
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <p className="truncate text-[14px] font-bold text-ink">{spot.name}</p>
        <p className="line-clamp-1 text-[12px] text-caption">📍 {spot.address}</p>
        <p className="text-[12px] text-caption">
          {distanceLabel} · {modeLabel} {spot.duration_minutes}분
        </p>
      </div>
    </button>
  );
}