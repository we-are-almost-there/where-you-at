import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CategoryFilter } from "./components/CategoryFilter";
import { SpotCard } from "./components/SpotCard";
import { SpotDetailSheet } from "./components/SpotDetailSheet";
import { getNearbySpots } from "./nearbyApi";
import type { NearbySpot, SpotCategory } from "./types";
import { ErrorNotice, CONNECTION_ERROR_TITLE, CONNECTION_ERROR_DESC } from "../map/components/ErrorNotice";

interface NearbyProps {
  courseId: number;
  routeType?: "trail" | "bicycle";
  /** 현재 보고 있는 카테고리. URL(tab/category 쿼리)에서 파생되어 상위(CourseDetail)가 내려준다. */
  category: SpotCategory;
  /** 카테고리 전환 시 상위에 알림 — 상위가 URL을 갱신한다. */
  onCategoryChange: (next: SpotCategory) => void;
  /** 현재 카테고리의 스팟 목록이 바뀔 때마다 호출 (지도 마커 렌더링용). */
  onSpotsChange?: (spots: NearbySpot[]) => void;
  /** 선택된(상세 시트가 열린) 스팟이 바뀔 때마다 호출 (지도 마커 강조용). */
  onSelectedChange?: (spot: NearbySpot | null) => void;
  onBack?: () => void;
}

export interface NearbyHandle {
  /** 지도 마커 클릭 시 부모가 호출 — 해당 스팟의 상세 시트를 연다. */
  selectSpotById: (id: string) => void;
}

export const Nearby = forwardRef<NearbyHandle, NearbyProps>(function Nearby(
  { courseId, routeType = "trail", category, onCategoryChange, onSpotsChange, onSelectedChange, onBack },
  ref
) {
  const [selected, setSelected] = useState<NearbySpot | null>(null);
  // SpotList가 페이지네이션으로 관리하는 스팟 목록의 로컬 미러.
  // 지도 마커 클릭(selectSpotById)에서 id로 스팟을 찾기 위해 필요하다.
  const currentSpotsRef = useRef<NearbySpot[]>([]);

  useImperativeHandle(ref, () => ({
    selectSpotById: (id: string) => {
      const spot = currentSpotsRef.current.find((s) => s.id === id);
      if (spot) {
        setSelected(spot);
        onSelectedChange?.(spot);
      }
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

  // 목록이 초기화될 때(버전 불일치 자동 재조회 등) 상세 시트도 같이 닫는다.
  // 단순한 다음 페이지 추가(loadMore 성공)에서는 호출되지 않아 선택 상태가 유지된다.
  const handleReset = () => {
    setSelected(null);
    onSelectedChange?.(null);
  };

  // 카테고리 전환 시 이전 카테고리의 스팟이 지도에 남아있지 않도록 비운다.
  // (SpotList가 key로 리마운트되면서 새 목록을 다시 알려줄 때까지의 공백 구간)
  const handleCategoryChange = (next: SpotCategory) => {
    onCategoryChange(next);
    currentSpotsRef.current = [];
    onSpotsChange?.([]);
  };

  return (
    <>
      <CategoryFilter value={category} onChange={handleCategoryChange} />

      {/* 주변정보 탭 콘텐츠 전체에 최소 높이를 건다 — 카테고리 전환 때마다(로딩/빈 결과/실제
        목록 상관없이) 시트가 코스 정보 탭에서 사용자가 정해둔 펼침 상태(71%)를 그대로
        유지하게 한다. 개별 분기(로딩만 등)에 걸면 카테고리 바뀔 때마다 시트가 오르락내리락한다. */}
      <div className="min-h-[71dvh] md:min-h-0">
        <SpotList
          key={`${courseId}:${category}:${routeType}`}
          courseId={courseId}
          category={category}
          routeType={routeType}
          onSelect={handleSelect}
          onSpotsChange={handleSpotsChange}
          onBack={onBack}
          onReset={handleReset}
        />
      </div>

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
  onReset: () => void;
  onBack?: () => void;
}

interface SpotListState {
  spots: NearbySpot[];
  totalCount: number;
  page: number;
  listVersion: string | null;
  loading: boolean;
  loadingMore: boolean;
  exhausted: boolean;
  error: string | null;
}

const MAX_AUTO_RESTARTS = 3;

function uniqueSpots(spots: NearbySpot[]): NearbySpot[] {
  const seen = new Set<string>();

  return spots.filter((spot) => {
    if (seen.has(spot.id)) return false;
    seen.add(spot.id);
    return true;
  });
}

function SpotList({
  courseId,
  category,
  routeType,
  onSelect,
  onSpotsChange,
  onReset,
  onBack,
}: SpotListProps) {
  const [state, setState] = useState<SpotListState>({
    spots: [],
    totalCount: 0,
    page: 1,
    listVersion: null,
    loading: true,
    loadingMore: false,
    exhausted: false,
    error: null,
  });

  // 비동기 콜백에서도 최신 페이지·버전·종료 상태를 확인한다.
  const stateRef = useRef(state);
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);
  const autoRestartsRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // onReset은 부모(Nearby)가 매 렌더마다 새로 만드는 콜백이라 의존성 배열에 넣으면
  // 부모 리렌더만으로 loadFirstPage가 재생성되고, 그 아래 마운트 useEffect까지
  // 다시 실행돼 요청이 처음부터 재시작된다. ref로 최신 값만 따라가게 하고
  // loadFirstPage 의존성에서는 뺀다.
  const onResetRef = useRef(onReset);
  useEffect(() => {
    onResetRef.current = onReset;
  });

  const updateState = useCallback((patch: Partial<SpotListState>) => {
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    setState(next); 
  }, []);

  const loadFirstPage = useCallback(async () => {
    const generation = ++generationRef.current;
    inFlightRef.current = true;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    onResetRef.current();

    updateState({
      spots: [],
      totalCount: 0,
      page: 1,
      listVersion: null,
      loading: true,
      loadingMore: false,
      exhausted: false,
      error: null,
    });

    try {
      const result = await getNearbySpots(
        courseId,
        category,
        routeType,
        1,
        controller.signal,
      );

      if (generation !== generationRef.current) return;

      if (!result.listVersion) {
        throw new Error("목록 버전을 확인하지 못했어요. 다시 시도해 주세요.");
      }

      const spots = uniqueSpots(result.spots);

      updateState({
        spots,
        totalCount: result.totalCount,
        page: 1,
        listVersion: result.listVersion,
        exhausted:
          result.spots.length === 0 ||
          spots.length >= result.totalCount,
      });
    } catch (error) {
      if (generation !== generationRef.current) return;
      if (error instanceof DOMException && error.name === "AbortError") return;

      updateState({
        error:
          error instanceof Error
            ? error.message
            : "주변 정보를 불러오지 못했어요.",
      });
    } finally {
      if (generation === generationRef.current) {
        inFlightRef.current = false;
        updateState({ loading: false, loadingMore: false });
      }
    }
  }, [courseId, category, routeType, updateState]);

  useEffect(() => {
    autoRestartsRef.current = 0;
    void loadFirstPage();

    return () => {
      // 언마운트 또는 effect 재실행 이전의 응답을 무효화한다.
      generationRef.current += 1;
      inFlightRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, [loadFirstPage]);

  // 목록 초기화와 추가 로딩 모두 지도에 반영한다.
  useEffect(() => {
    onSpotsChange(state.spots);
    // 부모 콜백의 참조 변경만으로 알림을 반복하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.spots]);

  const loadMore = useCallback(async () => {
    const current = stateRef.current;

    if (
      inFlightRef.current ||
      current.loading ||
      current.error !== null ||
      current.exhausted ||
      current.listVersion === null ||
      current.spots.length >= current.totalCount
    ) {
      return;
    }

    const generation = generationRef.current;
    const expectedVersion = current.listVersion;
    const nextPage = current.page + 1;

    inFlightRef.current = true;
    updateState({ loadingMore: true });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await getNearbySpots(
        courseId,
        category,
        routeType,
        nextPage,
        controller.signal,
      );

      if (generation !== generationRef.current) return;

      if (!result.listVersion) {
        throw new Error("목록 버전을 확인하지 못했어요. 다시 시도해 주세요.");
      }

      if (result.listVersion !== expectedVersion) {
        if (autoRestartsRef.current >= MAX_AUTO_RESTARTS) {
          updateState({
            error: "목록이 계속 변경되고 있어요. 다시 불러와 주세요.",
          });
          return;
        }

        autoRestartsRef.current += 1;
        await loadFirstPage();
        return;
      }

      autoRestartsRef.current = 0;

      const merged = uniqueSpots([
        ...stateRef.current.spots,
        ...result.spots,
      ]);

      updateState({
        spots: merged,
        totalCount: result.totalCount,
        page: nextPage,
        exhausted:
          result.spots.length === 0 ||
          merged.length >= result.totalCount,
      });
    } catch (error) {
      if (generation !== generationRef.current) return;
      if (error instanceof DOMException && error.name === "AbortError") return;

      updateState({
        error:
          error instanceof Error
            ? error.message
            : "주변 정보를 더 불러오지 못했어요.",
      });
    } finally {
      if (generation === generationRef.current) {
        inFlightRef.current = false;
        updateState({ loadingMore: false });
      }
    }
  }, [
    courseId,
    category,
    routeType,
    loadFirstPage,
    updateState,
  ]);

  const hasMore =
    !state.exhausted &&
    state.spots.length < state.totalCount;

  useEffect(() => {
    if (
      state.loading ||
      state.loadingMore ||
      state.error !== null ||
      !hasMore
    ) {
      return;
    }

    const element = sentinelRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [
    hasMore,
    state.loading,
    state.loadingMore,
    state.error,
    state.page,
    loadMore,
  ]);

  const retry = () => {
    if (inFlightRef.current) return;

    autoRestartsRef.current = 0;
    void loadFirstPage();
  };

  if (state.loading) {
    return (
      <p className="pt-10 text-center text-[13px] text-caption">
        불러오는 중…
      </p>
    );
  }

  if (state.spots.length === 0 && state.error === null) {
    return (
      <p className="pt-10 text-center text-[13px] text-caption">
        주변 정보가 없어요
      </p>
    );
  }

  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-3">
        {state.spots.map((spot) => (
          <SpotCard
            key={spot.id}
            spot={spot}
            routeType={routeType}
            onSelect={onSelect}
          />
        ))}
      </div>

      {state.error !== null ? (
        <div role="alert">
          <ErrorNotice
            title={
              state.error === `${CONNECTION_ERROR_TITLE}. 잠시 후 다시 시도해 주세요.`
                ? CONNECTION_ERROR_TITLE
                : "주변 정보를 불러오지 못했어요"
            }
            description={
              state.error === `${CONNECTION_ERROR_TITLE}. 잠시 후 다시 시도해 주세요.`
                ? CONNECTION_ERROR_DESC
                : state.error
            }
            onRetry={retry}
            onBack={onBack}
          />
        </div>
      ) : (
        hasMore && (
          <div
            ref={sentinelRef}
            className="py-4 text-center text-[12px] text-caption"
          >
            {state.loadingMore ? "더 불러오는 중…" : ""}
          </div>
        )
      )}
    </div>
  );
}
