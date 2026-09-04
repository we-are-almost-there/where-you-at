import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { BicycleList } from "./components/BicycleList";
import { BicycleTabs, type DataSourceTab } from "./components/BicycleTabs";
import { Pagination } from "../map/components/Pagination";
import { ErrorNotice, CONNECTION_ERROR_TITLE, CONNECTION_ERROR_DESC } from "../map/components/ErrorNotice";
import {
  getBicycleFacilities,
  getBicycleRegions,
  getBicycleSubregions,
  type BicycleRegionOption,
  type BicycleSubregionOption,
} from "./bicycleApi";
import type { BicycleFacilityListResponse } from "./types";
import AppHeader from "../../components/layout/AppHeader";
import { BicycleRegionSelect } from "./components/BicycleRegionSelect";
import { buildBicycleRegionOptions, buildBicycleSubregionOptions } from "./regionOptions";

const DEFAULT_PAGE_SIZE = 20;

const EMPTY_RES: BicycleFacilityListResponse = {
  total_count: 0,
  page: 1,
  size: DEFAULT_PAGE_SIZE,
  facilities: [],
};

const FACILITY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "rental_staffed", label: "유인대여소" },
  { value: "rental_unmanned", label: "무인대여소" },
  { value: "rental_mixed", label: "유·무인 대여소" },
];

const FEE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "무료", label: "무료" },
  { value: "유료", label: "유료" },
];

const SELECT_CLASS = "rounded-lg border border-divider bg-white px-3 py-2 text-[14px] font-medium text-ink";

const TAB_TO_DATA_SOURCE: Record<DataSourceTab, string> = {
  "운영 정보": "standard",
  "실시간": "realtime",
};
const DATA_SOURCE_TO_TAB: Record<string, DataSourceTab> = {
  standard: "운영 정보",
  realtime: "실시간",
};

export function BicycleExplore() {
  // Race/Support와 동일한 이유 — 필터·탭에 따라 목록 길이가 달라져 스크롤
  // 유무가 갈리는 페이지라, 여기서만 scrollbar-gutter: stable을 켠다.
  useEffect(() => {
    document.documentElement.classList.add("scrollbar-gutter-stable");
    return () => document.documentElement.classList.remove("scrollbar-gutter-stable");
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const region = searchParams.get("region") ?? "";
  const subregionCode = searchParams.get("gu") ?? "";
  const facilityType = searchParams.get("type") ?? "";
  const feeType = searchParams.get("fee") ?? "";

  const dataSource = searchParams.get("source") ?? "standard";
  const activeTab: DataSourceTab = DATA_SOURCE_TO_TAB[dataSource] ?? "운영 정보";

  const [regions, setRegions] = useState<BicycleRegionOption[]>([]);
  const [subregions, setSubregions] = useState<BicycleSubregionOption[]>([]);

  useEffect(() => {
    getBicycleRegions(dataSource)
      .then((newRegions) => {
        setRegions(newRegions);
        const stillValid = newRegions.some(
          (r) => r.region_code === region || r.region_code.startsWith(region),
        );
        if (region && !stillValid) {
          const params: Record<string, string> = { page: "1", source: dataSource };
          if (dataSource === "standard" && facilityType) params.type = facilityType;
          if (dataSource === "standard" && feeType) params.fee = feeType;
          setSearchParams(params);
        }
      })
      .catch((err) => console.error("[BicycleExplore] regions fetch failed:", err));
  }, [dataSource]);

  useEffect(() => {
    if (!region) return;
    let cancelled = false;
    getBicycleSubregions(region, dataSource)
      .then((opts) => !cancelled && setSubregions(opts))
      .catch((err) => console.error("[BicycleExplore] subregions fetch failed:", err));
    return () => {
      cancelled = true;
    };
  }, [region, dataSource]);

  const effectiveSubregions = region ? subregions : [];

  const regionOptions = useMemo(() => buildBicycleRegionOptions(regions), [regions]);
  const subregionOptions = useMemo(
    () => buildBicycleSubregionOptions(effectiveSubregions),
    [effectiveSubregions],
  );

  const query = useMemo(() => {
    const q: Record<string, string> = {
      page: String(page),
      size: String(DEFAULT_PAGE_SIZE),
      data_source: dataSource,
    };
    const effectiveRegion = subregionCode || region;
    if (effectiveRegion) q.region = effectiveRegion;
    if (facilityType) q.facility_type = facilityType;
    if (feeType) q.fee_type = feeType;
    return q;
  }, [page, region, subregionCode, facilityType, feeType, dataSource]);

  const queryKey = useMemo(() => JSON.stringify(query), [query]);
  const [res, setRes] = useState<BicycleFacilityListResponse>(EMPTY_RES);
  const [resolvedQuery, setResolvedQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const loading = resolvedQuery !== queryKey;

  useEffect(() => {
    let cancelled = false;
    getBicycleFacilities(query)
      .then((r) => {
        if (cancelled) return;
        setRes(r);
        setError(null);
        setResolvedQuery(queryKey);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "자전거 시설을 불러오지 못했어요");
        setResolvedQuery(queryKey);
      });
    return () => {
      cancelled = true;
    };
  }, [queryKey, retryTick]);

  const retry = () => {
    setError(null);
    setRetryTick((t) => t + 1);
  };

  // res는 로딩 중엔 이전 응답 그대로 유지되므로(setRes가 성공 시에만 호출됨),
  // totalPages도 별도 처리 없이 자동으로 안정적이다 — 탭/필터 전환 중에도
  // 페이지네이션이 사라졌다 나타나며 화면이 흔들리지 않는다.
  const totalPages = Math.max(1, Math.ceil(res.total_count / DEFAULT_PAGE_SIZE));

  const changeRegion = (next: string) => {
    const params: Record<string, string> = { page: "1", source: dataSource };
    if (next) params.region = next;
    if (facilityType) params.type = facilityType;
    if (feeType) params.fee = feeType;
    setSearchParams(params);
  };

  const changeSubregion = (next: string) => {
    const params: Record<string, string> = { page: "1", source: dataSource };
    if (region) params.region = region;
    if (next) params.gu = next;
    if (facilityType) params.type = facilityType;
    if (feeType) params.fee = feeType;
    setSearchParams(params);
  };

  const changeFacilityType = (next: string) => {
    const params: Record<string, string> = { page: "1", source: dataSource };
    if (region) params.region = region;
    if (subregionCode) params.gu = subregionCode;
    if (next) params.type = next;
    if (feeType) params.fee = feeType;
    setSearchParams(params);
  };

  const changeFeeType = (next: string) => {
    const params: Record<string, string> = { page: "1", source: dataSource };
    if (region) params.region = region;
    if (subregionCode) params.gu = subregionCode;
    if (facilityType) params.type = facilityType;
    if (next) params.fee = next;
    setSearchParams(params);
  };

  const changeTab = (next: DataSourceTab) => {
    const params: Record<string, string> = { page: "1", source: TAB_TO_DATA_SOURCE[next] };
    if (next === "운영 정보" && facilityType) params.type = facilityType;
    if (next === "운영 정보" && feeType) params.fee = feeType;
    setSearchParams(params);
  };

  return (
    <>
      <AppHeader variant="wide" />
      <div className="px-[max(1rem,calc((100%-72rem)/2+1rem))] pt-4 pb-4">
        <h1 className="mb-3 text-xl font-bold text-gray-900">자전거 대여소</h1>

        <div className="mb-3">
          <BicycleTabs value={activeTab} onChange={changeTab} />
        </div>

        <div className="grid grid-cols-2 gap-2 min-[632px]:flex min-[632px]:flex-wrap">
          <BicycleRegionSelect
            value={region}
            onChange={changeRegion}
            regions={regionOptions}
            className={`${SELECT_CLASS} w-full min-[632px]:w-[140px]`}
          />

          <BicycleRegionSelect
            value={subregionCode}
            onChange={changeSubregion}
            regions={subregionOptions}
            placeholder={!region ? "지역을 먼저 선택" : subregionOptions.length === 0 ? "세부 지역 없음" : "전체 세부 지역"}
            disabled={!region || subregionOptions.length === 0}
            className={`${SELECT_CLASS} w-full min-[632px]:w-[140px] disabled:cursor-not-allowed disabled:opacity-50`}
          />

          {dataSource === "standard" && (
            <>
              <select
                value={facilityType}
                onChange={(e) => changeFacilityType(e.target.value)}
                className={`${SELECT_CLASS} w-full min-[632px]:w-[140px]`}
              >
                <option value="">전체 유형</option>
                {FACILITY_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <select
                value={feeType}
                onChange={(e) => changeFeeType(e.target.value)}
                className={`${SELECT_CLASS} w-full min-[632px]:w-[140px]`}
              >
                <option value="">전체 요금</option>
                {FEE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        <p className="mt-3 mb-3 text-[13px] text-caption">총 {res.total_count}개 시설</p>

        {error ? (
          <ErrorNotice title={CONNECTION_ERROR_TITLE} description={CONNECTION_ERROR_DESC} onRetry={retry} />
        ) : loading ? (
          <p className="py-10 text-center text-sm text-gray-400">불러오는 중...</p>
        ) : (
          <BicycleList facilities={res.facilities} variant={dataSource as "standard" | "realtime"} />
        )}

        {!error && !loading && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={(nextPage) => {
              const params: Record<string, string> = { page: String(nextPage), source: dataSource };
              if (region) params.region = region;
              if (subregionCode) params.gu = subregionCode;
              if (facilityType) params.type = facilityType;
              if (feeType) params.fee = feeType;
              setSearchParams(params);
            }}
          />
        )}
      </div>
    </>
  );
}
