import { useEffect, useRef, useState } from "react";
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

  return (
    <>
      <CategoryFilter value={category} onChange={setCategory} />

      <SpotList
        key={`${courseId}:${category}:${routeType}`}
        courseId={courseId}
        category={category}
        routeType={routeType}
        onSelect={setSelected}
      />

      {selected && <SpotDetailSheet key={selected.id} spot={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

interface SpotListProps {
  courseId: number;
  category: SpotCategory;
  routeType: "trail" | "bicycle";
  onSelect: (spot: NearbySpot) => void;
}

function SpotList({ courseId, category, routeType, onSelect }: SpotListProps) {
  const [spots, setSpots] = useState<NearbySpot[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // key로 courseId/category/routeType이 바뀌면 이 컴포넌트가 리마운트되므로,
  // 여기 있는 useState 초기값(spots: [], loading: true 등)이 이미 "초기화된 상태"다.
  useEffect(() => {
    let cancelled = false;
    getNearbySpots(courseId, category, routeType, 1)
      .then((result) => {
        if (cancelled) return;
        setSpots(result.spots);
        setTotalCount(result.totalCount);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "주변 정보를 불러오지 못했어요");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = () => {
    if (loadingMore || spots.length >= totalCount) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    getNearbySpots(courseId, category, routeType, nextPage)
      .then((result) => {
        setSpots((prev) => [...prev, ...result.spots]);
        setPage(nextPage);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots, totalCount, page, loadingMore]);

  const hasMore = spots.length < totalCount;

  if (loading) return <p className="pt-10 text-center text-[13px] text-caption">불러오는 중…</p>;
  if (error) return <p className="pt-10 text-center text-[13px] text-caption">{error}</p>;
  if (spots.length === 0) return <p className="pt-10 text-center text-[13px] text-caption">주변 정보가 없어요</p>;

  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-3">
        {spots.map((spot) => (
          <SpotCard key={spot.id} spot={spot} routeType={routeType} onSelect={onSelect} />
        ))}
      </div>
      {hasMore && (
        <div ref={sentinelRef} className="py-4 text-center text-[12px] text-caption">
          {loadingMore ? "더 불러오는 중…" : ""}
        </div>
      )}
    </div>
  );
}