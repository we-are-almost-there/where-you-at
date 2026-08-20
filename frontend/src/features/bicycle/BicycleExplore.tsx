import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { BicycleList } from "./components/BicycleList";
import { Pagination } from "../map/components/Pagination";
import { ErrorNotice, CONNECTION_ERROR_TITLE, CONNECTION_ERROR_DESC } from "../map/components/ErrorNotice";
import {
  getBicycleFacilities,
  getBicycleRegions,
  getBicycleSigungu,
  type BicycleRegionOption,
  type BicycleSigunguOption,
} from "./bicycleApi";
import type { BicycleFacilityListResponse } from "./types";
import AppHeader from "../../components/layout/AppHeader";

const DEFAULT_PAGE_SIZE = 20;

const EMPTY_RES: BicycleFacilityListResponse = {
  total_count: 0,
  page: 1,
  size: DEFAULT_PAGE_SIZE,
  facilities: [],
};

export function BicycleExplore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  // region 하나로 시/도(2자리)·시/군/구(5자리)를 모두 표현.
  // region_code 앞 2자리가 항상 시/도이므로 별도 sido 파라미터가 불필요하다.
  const region = searchParams.get("region") ?? "";
  const sidoCode = region.slice(0, 2);
  const sigunguCode = region.length === 5 ? region : "";

  const [regionOptions, setRegionOptions] = useState<BicycleRegionOption[]>([]);
  const [sigunguOptions, setSigunguOptions] = useState<BicycleSigunguOption[]>([]);

  useEffect(() => {
    getBicycleRegions()
      .then(setRegionOptions)
      .catch((err) => console.error("[BicycleExplore] regions fetch failed:", err));
  }, []);

  // 시/도 변경 시 그 안의 시/군/구 목록 로드.
  useEffect(() => {
    if (!sidoCode) return;
    let cancelled = false;
    getBicycleSigungu(sidoCode)
      .then((opts) => !cancelled && setSigunguOptions(opts))
      .catch((err) => console.error("[BicycleExplore] sigungu fetch failed:", err));
    return () => {
      cancelled = true;
    };
  }, [sidoCode]);

  const query = useMemo(() => {
    const q: Record<string, string> = { page: String(page), size: String(DEFAULT_PAGE_SIZE) };
    if (region) q.region = region;
    return q;
  }, [page, region]);

  const [res, setRes] = useState<BicycleFacilityListResponse>(EMPTY_RES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getBicycleFacilities(query)
      .then((r) => {
        if (cancelled) return;
        setRes(r);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "자전거 시설을 불러오지 못했어요"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, retryTick]);

  const retry = () => {
    setLoading(true);
    setError(null);
    setRetryTick((t) => t + 1);
  };

  const totalPages = Math.max(1, Math.ceil(res.total_count / DEFAULT_PAGE_SIZE));

  const changeSido = (next: string) => {
    setSearchParams(next ? { page: "1", region: next } : { page: "1" });
  };

  const changeSigungu = (next: string) => {
    setSearchParams(next ? { page: "1", region: next } : sidoCode ? { page: "1", region: sidoCode } : { page: "1" });
  };

  return (
    <>
      <AppHeader variant="wide" />
      <div className="mx-auto w-full max-w-[1200px] px-6 pt-4 pb-4">
        <h1 className="mb-3 text-xl font-bold text-gray-900">자전거 대여소</h1>

        <div className="flex gap-2">
          <select
            value={sidoCode}
            onChange={(e) => changeSido(e.target.value)}
            className="rounded-md border border-divider px-3 py-2 text-[14px] text-ink"
          >
            <option value="">전체 지역</option>
            {regionOptions.map((r) => (
              <option key={r.sido_code} value={r.sido_code}>
                {r.sido}
              </option>
            ))}
          </select>

          {sidoCode && (
            <select
              value={sigunguCode}
              onChange={(e) => changeSigungu(e.target.value)}
              className="rounded-md border border-divider px-3 py-2 text-[14px] text-ink"
            >
              <option value="">전체</option>
              {sigunguOptions.map((s) => (
                <option key={s.region_code} value={s.region_code}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <p className="mt-3 mb-3 text-[13px] text-caption">총 {res.total_count}개 시설</p>

        {error ? (
          <ErrorNotice title={CONNECTION_ERROR_TITLE} description={CONNECTION_ERROR_DESC} onRetry={retry} />
        ) : loading ? (
          <p className="py-10 text-center text-sm text-gray-400">불러오는 중...</p>
        ) : (
          <>
            <BicycleList facilities={res.facilities} />
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={(nextPage) => {
                const params: Record<string, string> = { page: String(nextPage) };
                if (region) params.region = region;
                setSearchParams(params);
              }}
            />
          </>
        )}
      </div>
    </>
  );
}
