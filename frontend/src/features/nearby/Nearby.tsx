import { useMemo, useState } from "react";
import { CategoryFilter } from "./components/CategoryFilter";
import { SpotCard } from "./components/SpotCard";
import { SpotDetailSheet } from "./components/SpotDetailSheet";
import { getNearbySpotsMock } from "./nearbyMock";
import type { NearbySpot, SpotCategory } from "./types";

interface NearbyProps {
  courseId: number;
}

export function Nearby({ courseId }: NearbyProps) {
  const [category, setCategory] = useState<SpotCategory>("attraction");
  const [selected, setSelected] = useState<NearbySpot | null>(null);
  const spots = useMemo(() => getNearbySpotsMock(courseId, category), [courseId, category]);

  return (
    <>
      <CategoryFilter value={category} onChange={setCategory} />

      <div className="mt-3">
        {spots.length === 0 ? (
          <p className="pt-10 text-center text-[13px] text-caption">주변 정보가 없어요</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {spots.map((spot) => (
              <SpotCard key={spot.id} spot={spot} onSelect={setSelected} />
            ))}
          </div>
        )}
      </div>

      {selected && <SpotDetailSheet spot={selected} onClose={() => setSelected(null)} />}
    </>
  );
}