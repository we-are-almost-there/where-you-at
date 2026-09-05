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

// 페이지당 20개. 24로 늘리면 3열(태블릿) 구간의 마지막 줄은 꽉 채울 수 있지만,
// 2열(모바일) 구간이 10줄→12줄로 늘어나 스크롤 부담이 커진다. 3열 마지막 줄이
// 2개로 끝나는 정도는 자연스러운 그리드 특성으로 보고 20을 그대로 유지한다.
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
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);

  // navigator.geolocation 지원 여부는 상태가 아니라 매 렌더 계산해도 되는 값
  const geoSupported = typeof navigator !== "undefined" && !!navigator.geolocation;

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
    // dataSource(탭) 변경 시에만 지역 목록을 재조회한다. region/facilityType/feeType은
    // effect 실행 시점의 최신값만 확인하면 되고, 이 값들이 바뀔 때마다 재조회할
    // 필요는 없어 의도적으로 deps에서 제외한다(포함 시 필터 변경마다 불필요한 재조회 발생).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 위치 응답을 기다리지 않고 곧바로 기본 순서(ID순)로
  // 먼저 보여준다. 위치가 나중에 도착하면 query가 바뀌어 조용히 재조회되고,
  // 그 결과 순서만 "가까운 순"으로 자연스럽게 바뀐다. 거부/미지원이면 그대로 ID순 유지.
  useEffect(() => {
    if (userLoc || geoDenied || !geoSupported) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoDenied(true), // 타임아웃도 이 error 콜백으로 들어옴
      {
        timeout: 5000, // 5초 안에 응답 없으면 실패 처리 → ID순 유지
        maximumAge: 60000, // 1분 이내 캐시된 위치는 재사용 (즉시 응답 가능)
        enableHighAccuracy: false, // GPS 대신 wifi/IP 기반 등 빠른 방식 우선
      },
    );
  }, [userLoc, geoDenied, geoSupported]);

  const regionOptions = useMemo(() => buildBicycleRegionOptions(regions), [regions]);
  const subregionOptions = useMemo(
    () => buildBicycleSubregionOptions(region ? subregions : []),
    [region, subregions],
  );

  const effectiveRegion = subregionCode || region;

  const query = useMemo(() => {
    const q: Record<string, string> = {
      page: String(page),
      size: String(DEFAULT_PAGE_SIZE),
      data_source: dataSource,
    };
    if (effectiveRegion) q.region = effectiveRegion;
    if (facilityType) q.facility_type = facilityType;
    if (feeType) q.fee_type = feeType;
    // 지역 필터를 선택했어도 위치를 확보했으면 항상 가까운 순으로 정렬한다.
    // (예: "세종" 필터 + 내 위치가 부산이어도, 세종 안에서 내 위치 기준
    // 가까운 순으로 보여준다 — 지역 중심이 아니라 실제 사용자 위치 기준.)
    if (userLoc) {
      q.sort = "nearest";
      q.lat = String(userLoc.lat);
      q.lng = String(userLoc.lng);
    }
    return q;
  }, [page, effectiveRegion, facilityType, feeType, dataSource, userLoc]);

  const queryKey = useMemo(() => JSON.stringify(query), [query]);

  const [res, setRes] = useState<BicycleFacilityListResponse>(EMPTY_RES);
  const [resolvedQueryKey, setResolvedQueryKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // queryKey가 마지막으로 반영 완료된 값과 다르면 로딩 중이라는 뜻 — 렌더링 중 계산.
  const loading = resolvedQueryKey !== queryKey;

  // 진입 시 위치를 기다리지 않으므로 첫 로딩이 빠르고, 위치가 나중에 도착해
  // query가 바뀌면 여기서 곧바로 재조회되어 순서만 조용히 갱신된다.
  useEffect(() => {
    let cancelled = false;
    getBicycleFacilities(query)
      .then((r) => {
        if (cancelled) return;
        setRes(r);
        setError(null);
        setResolvedQueryKey(queryKey);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "자전거 시설을 불러오지 못했어요");
        setResolvedQueryKey(queryKey);
      });
    return () => {
      cancelled = true;
    };
    // query 대신 queryKey(query를 문자열화한 값)로 변경 여부를 비교한다. query 객체
    // 참조는 매 렌더 바뀔 수 있어도 queryKey가 같으면 재실행할 필요가 없으므로,
    // query는 의도적으로 deps에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, retryTick]);

  const retry = () => {
    setError(null);
    setRetryTick((t) => t + 1);
  };

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

        <p className="mt-3 mb-3 text-[13px] text-caption">
          총 {res.total_count}개 시설
          {query.sort === "nearest" && " · 가까운 순"}
        </p>

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
