import { useEffect, useState, useRef } from "react";
import { CategoryFilter } from "./components/CategoryFilter";
import { SpotCard } from "./components/SpotCard";
import { SpotDetailSheet } from "./components/SpotDetailSheet";
import { getNearbySpots } from "./nearbyApi";
import type { NearbySpot, SpotCategory } from "./types";

interface NearbyProps {
  courseId: number;
  routeType?: "trail" | "bicycle";
}

export function Nearby({ courseId, routeType = "trail" }: NearbyProps) {
  const [category, setCategory] = useState<SpotCategory>("attraction");
  const [selected, setSelected] = useState<NearbySpot | null>(null);
  const [spots, setSpots] = useState<NearbySpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, NearbySpot[]>>(new Map());

  useEffect(() => {
    const key = `${courseId}:${category}:${routeType}`;
    const cached = cacheRef.current.get(key);
    if (cached) {
      setSpots(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    getNearbySpots(courseId, category, routeType)
      .then((result) => {
        if (cancelled) return;
        cacheRef.current.set(key, result);
        setSpots(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "주변 정보를 불러오지 못했어요");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, category, routeType]);

  return (
    <>
      <CategoryFilter value={category} onChange={setCategory} />

      <div className="mt-3">
        {loading ? (
          <p className="pt-10 text-center text-[13px] text-caption">불러오는 중…</p>
        ) : error ? (
          <p className="pt-10 text-center text-[13px] text-caption">{error}</p>
        ) : spots.length === 0 ? (
          <p className="pt-10 text-center text-[13px] text-caption">주변 정보가 없어요</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {spots.map((spot) => (
              <SpotCard key={spot.id} spot={spot} routeType={routeType} onSelect={setSelected} />
            ))}
          </div>
        )}
      </div>

      {selected && <SpotDetailSheet spot={selected} onClose={() => setSelected(null)} />}
    </>
  );
}