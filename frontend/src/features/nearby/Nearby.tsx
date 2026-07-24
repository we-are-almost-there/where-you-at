import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CategoryFilter } from "./components/CategoryFilter";
import { SpotCard } from "./components/SpotCard";
import { SpotDetailSheet } from "./components/SpotDetailSheet";
import { getNearbySpots } from "./nearbyApi";
import type { NearbySpot, SpotCategory } from "./types";

interface NearbyProps {
  courseId: number;
  routeType?: "trail" | "bicycle";
  /** 현재 카테고리의 스팟 목록이 바뀔 때마다 호출 (지도 마커 렌더링용). */
  onSpotsChange?: (spots: NearbySpot[]) => void;
  /** 선택된(상세 시트가 열린) 스팟이 바뀔 때마다 호출 (지도 마커 강조용). */
  onSelectedChange?: (spot: NearbySpot | null) => void;
}

export interface NearbyHandle {
  /** 지도 마커 클릭 시 부모가 호출 — 해당 스팟의 상세 시트를 연다. */
  selectSpotById: (id: number) => void;
}

export const Nearby = forwardRef<NearbyHandle, NearbyProps>(function Nearby(
  { courseId, routeType = "trail", onSpotsChange, onSelectedChange },
  ref
) {
  const [category, setCategory] = useState<SpotCategory>("attraction");
  const [selected, setSelected] = useState<NearbySpot | null>(null);
  // SpotList가 페이지네이션으로 관리하는 스팟 목록의 로컬 미러.
  // 지도 마커 클릭(selectSpotById)에서 id로 스팟을 찾기 위해 필요하다.
  const currentSpotsRef = useRef<NearbySpot[]>([]);

  useImperativeHandle(ref, () => ({
    selectSpotById: (id: number) => {
      const spot = currentSpotsRef.current.find((s) => s.id === id);
      if (spot) setSelected(spot);
    },
  }));

  const handleSpotsChange = (spots: NearbySpot[]) => {
    currentSpotsRef.current = spots;
    onSpotsChange?.(spots);
  };

  const handleSelect = (spot: NearbySpot) => {
    setSelected(spot);
    onSelectedChange?.(spot);
  };

  const handleClose = () => {
    setSelected(null);
    onSelectedChange?.(null);
  };

  // 카테고리 전환 시 이전 카테고리의 스팟이 지도에 남아있지 않도록 비운다.
  // (SpotList가 key로 리마운트되면서 새 목록을 다시 알려줄 때까지의 공백 구간)
  const handleCategoryChange = (next: SpotCategory) => {
    setCategory(next);
    currentSpotsRef.current = [];
    onSpotsChange?.([]);
  };

  return (
    <>
      <CategoryFilter value={category} onChange={handleCategoryChange} />

      <SpotList
        key={`${courseId}:${category}:${routeType}`}
        courseId={courseId}
        category={category}
        routeType={routeType}
        onSelect={handleSelect}
        onSpotsChange={handleSpotsChange}
      />

      {selected && (
        <SpotDetailSheet key={selected.id} spot={selected} onClose={handleClose} />
      )}
    </>
  );
});

interface SpotListProps {
  courseId: number;
  category: SpotCategory;
  routeType: "trail" | "bicycle";
  onSelect: (spot: NearbySpot) => void;
  onSpotsChange: (spots: NearbySpot[]) => void;
}

function SpotList({ courseId, category, routeType, onSelect, onSpotsChange }: SpotListProps) {
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

  // spots가 바뀔 때마다(최초 로드 + loadMore로 이어붙일 때마다) 부모에 알림
  useEffect(() => {
    onSpotsChange(spots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots]);

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