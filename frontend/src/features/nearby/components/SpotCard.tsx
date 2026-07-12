import type { NearbySpot } from "../types";

interface Props {
  spot: NearbySpot;
  onSelect: (spot: NearbySpot) => void;
}

export function SpotCard({ spot, onSelect }: Props) {
  const distanceLabel = spot.distance_m >= 1000 ? `${(spot.distance_m / 1000).toFixed(1)}km` : `${spot.distance_m}m`;

  return (
    <button
      type="button"
      onClick={() => onSelect(spot)}
      className="flex flex-col overflow-hidden rounded-xl bg-white text-left shadow-[0px_3px_10px_0px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0px_5px_16px_0px_rgba(0,0,0,0.16)]"
    >
      <div className="aspect-square w-full bg-lavender">
        {spot.image_url && (
          <img src={spot.image_url} alt={spot.name} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <p className="truncate text-[14px] font-bold text-ink">{spot.name}</p>
        <p className="line-clamp-1 text-[12px] text-caption">📍 {spot.address}</p>
        <p className="text-[12px] text-caption">
          {distanceLabel} · 도보 {spot.walk_minutes}분
        </p>
      </div>
    </button>
  );
}