import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { useSearchParams } from "react-router";
import { BicycleList } from "./components/BicycleList";
import { BicycleTabs, type DataSourceTab } from "./components/BicycleTabs";
import { Pagination } from "../map/components/Pagination";
import { ErrorNotice } from "../../components/error/ErrorNotice";
import { toUserError, type UserError } from "../../components/error/userError";
import {
  getAllBicycleFacilities,
  getBicycleFacilities,
  getBicycleRegions,
  getBicycleSubregions,
  type BicycleRegionOption,
  type BicycleSubregionOption,
} from "./bicycleApi";
import type { BicycleFacility, BicycleFacilityListResponse } from "./types";
import AppHeader from "../../components/layout/AppHeader";
import { BicycleRegionSelect } from "./components/BicycleRegionSelect";
import { buildBicycleRegionOptions, buildBicycleSubregionOptions } from "./regionOptions";
import { slicePage, sortByDistance } from "../map/nearestSort";
import { useLocationConsent } from "../location";

// 페이지당 20개. 24로 늘리면 3열(태블릿) 구간의 마지막 줄은 꽉 채울 수 있지만,
// 2열(모바일) 구간이 10줄→12줄로 늘어나 스크롤 부담이 커진다. 3열 마지막 줄이
// 2개로 끝나는 정도는 자연스러운 그리드 특성으로 보고 20을 그대로 유지한다.
const DEFAULT_PAGE_SIZE = 20;

// 가까운 순으로 받은 전체 목록을 다시 받는 기준 시간. 페이지 이동이나 탭 복귀 때 이보다 오래됐으면 다시 받는다.
// 전체를 한 번 받은 뒤로는 페이지를 넘겨도 요청하지 않아, 그대로 두면 대여 가능 대수가 처음 값으로 남는다.
// 운영 정보 탭도 실시간 매칭된 시설은 "대여 가능 N대"를 보여 주므로(BicycleCard) 두 탭 모두 다시 받는다.
const REFRESH_AFTER_MS = 60_000;

const EMPTY_RES: BicycleFacilityListResponse = {
  total_count: 0,
  page: 1,
  size: DEFAULT_PAGE_SIZE,
  facilities: [],
};

/** 서버가 페이지를 나눠 준 응답이거나, '가까운 순'을 위해 받은 현재 탭·필터의 시설 전체. */
type FetchedFacilities =
  | { mode: "page"; res: BicycleFacilityListResponse }
  | { mode: "all"; facilities: BicycleFacility[] };

/** 전체 목록을 받은 시각(fetchedAt)이 기준 시간보다 오래됐는지. 한 페이지 응답이면(null) 다시 받을 필요가 없다. */
function isAllListStale(fetchedAt: number | null, now: number): boolean {
  return fetchedAt !== null && now - fetchedAt >= REFRESH_AFTER_MS;
}

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
  const { requestConsent } = useLocationConsent();
  // 필터·탭에 따라 스크롤바가 나타나거나 사라져도 본문 너비를 유지한다.
  // AppHeader의 보정은 헤더 내부에만 적용되므로 본문 정렬을 위해 opt-in을 유지한다.
  useEffect(() => {
    document.documentElement.classList.add("scrollbar-gutter-stable");
    return () => document.documentElement.classList.remove("scrollbar-gutter-stable");
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const pageParam = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1;
  const region = searchParams.get("region") ?? "";
  const subregionCode = searchParams.get("gu") ?? "";
  const facilityType = searchParams.get("type") ?? "";
  const feeType = searchParams.get("fee") ?? "";

  const rawDataSource = searchParams.get("source") ?? "standard";
  const activeTab: DataSourceTab = DATA_SOURCE_TO_TAB[rawDataSource] ?? "운영 정보";
  const dataSource = TAB_TO_DATA_SOURCE[activeTab];

  const [regions, setRegions] = useState<BicycleRegionOption[]>([]);
  const [subregions, setSubregions] = useState<BicycleSubregionOption[]>([]);
  const [subregionsReady, setSubregionsReady] = useState(false);
  // subregionsKey는 지금 subregions가 어느 region/dataSource에 대한 응답인지만
  // 구분한다 (region이 바뀐 직후 이전 지역의 잔여 데이터를 걸러내기 위함).
  // 같은 키에 대한 재조회가 진행 중인지는 subregionsReady가 별도로 담당한다
  // (effect 시작 시 false로 리셋되므로, 재시도 중에는 키가 같아도 false가 된다).
  const [subregionsKey, setSubregionsKey] = useState<string | null>(null);
  // 실패한 요청의 {region, dataSource} 키. 다른 지역으로 이동한 뒤 첫 렌더에
  // 이전 실패가 잠깐 표시되는 것을 막기 위해, 현재 조합과 일치할 때만 에러로 취급한다.
  const [subregionsErrorKey, setSubregionsErrorKey] = useState<string | null>(null);
  const [subregionsRetryTick, setSubregionsRetryTick] = useState(0);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);

  // navigator.geolocation 지원 여부는 상태가 아니라 매 렌더 계산해도 되는 값
  const geoSupported = typeof navigator !== "undefined" && !!navigator.geolocation;

  useEffect(() => {
    let cancelled = false;
    getBicycleRegions(dataSource)
      .then((newRegions) => {
        if (cancelled) return;
        setRegions(newRegions);
        const stillValid = newRegions.some(
          (r) => r.region_code === region || r.region_code.startsWith(region),
        );
        if (region && !stillValid) {
          const params: Record<string, string> = { page: "1", source: dataSource };
          if (dataSource === "standard" && facilityType) params.type = facilityType;
          if (dataSource === "standard" && feeType) params.fee = feeType;
          setSearchParams(params, { replace: true });
        }
      })
      .catch((err) => {
        if (!cancelled) console.error("[BicycleExplore] regions fetch failed:", err);
      });
    return () => {
      cancelled = true;
    };
    // dataSource(탭) 변경 시에만 지역 목록을 재조회한다. region/facilityType/feeType은
    // effect 실행 시점의 최신값만 확인하면 되고, 이 값들이 바뀔 때마다 재조회할
    // 필요는 없어 의도적으로 deps에서 제외한다(포함 시 필터 변경마다 불필요한 재조회 발생).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource]);

  useEffect(() => {
    if (!region) return;
    let cancelled = false;
    // 새 지역으로 요청을 시작하는 시점에 이전 결과를 즉시 무효화한다.
    // region/dataSource만으로는 파생시킬 수 없는 "지금 막 새 요청을 시작했다"는
    // 타이밍 정보라 setState로 직접 표시할 수밖에 없다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubregionsReady(false);
    setSubregionsErrorKey(null);
    getBicycleSubregions(region, dataSource)
      .then((opts) => {
        if (cancelled) return;
        setSubregions(opts);
        setSubregionsKey(`${region}|${dataSource}`);
        setSubregionsReady(true);
      })
      .catch((err) => {
        console.error("[BicycleExplore] subregions fetch failed:", err);
        if (!cancelled) setSubregionsErrorKey(`${region}|${dataSource}`);
      });
    return () => {
      cancelled = true;
    };
  }, [region, dataSource, subregionsRetryTick]);

  // 세부 지역 조회만 독립적으로 재시도한다. 목록 전체 재시도(retry())와는
  // 별개 트리거로 둔다 — 세부 지역 API만 실패했을 수 있어 목록 재조회까지
  // 함께 묶으면 불필요한 재요청이 생긴다.
  const retrySubregions = () => setSubregionsRetryTick((t) => t + 1);

  // 위치 응답을 기다리지 않고 곧바로 기본 순서(ID순)로
  // 먼저 보여준다. 위치가 나중에 도착하면 query가 바뀌어 조용히 재조회되고,
  // 그 결과 순서만 "가까운 순"으로 자연스럽게 바뀐다. 거부/미지원이면 그대로 ID순 유지.
  useEffect(() => {
    if (userLoc || geoDenied || !geoSupported) return;
    let cancelled = false;
    requestConsent().then((allowed) => {
      if (cancelled) return;
      if (!allowed) {
        setGeoDenied(true);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => !cancelled && setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => !cancelled && setGeoDenied(true), // 타임아웃도 이 error 콜백으로 들어옴
        {
          timeout: 5000, // 5초 안에 응답 없으면 실패 처리 → ID순 유지
          maximumAge: 60000, // 1분 이내 캐시된 위치는 재사용 (즉시 응답 가능)
          enableHighAccuracy: false, // GPS 대신 wifi/IP 기반 등 빠른 방식 우선
        },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [userLoc, geoDenied, geoSupported, requestConsent]);

  const regionOptions = useMemo(() => buildBicycleRegionOptions(regions), [regions]);

  const subregionsMatchCurrent = !!region && subregionsKey === `${region}|${dataSource}`;
  const effectiveSubregionsReady = subregionsMatchCurrent && subregionsReady;
  // 에러도 키가 현재 region/dataSource와 일치할 때만 "지금 화면의 에러"로 취급한다.
  const subregionsErrorForCurrent = !!region && subregionsErrorKey === `${region}|${dataSource}`;

  const subregionOptions = useMemo(
    () => buildBicycleSubregionOptions(subregionsMatchCurrent ? subregions : []),
    [subregionsMatchCurrent, subregions],
  );

  // subregionCode가 현재 region의 하위 지역인지 검증한다.
  // - region이 없으면 gu를 신뢰할 근거 자체가 없으므로 무조건 무효.
  // - region은 있지만 조회가 아직 안 끝났으면(effectiveSubregionsReady === false)
  //   판단을 보류하고 subregionCode를 그대로 유지한다.
  // - 조회가 끝났으면(세종처럼 결과가 빈 배열인 경우 포함) 실제 목록과 대조한다.
  //   region이 falsy면 뒤의 subregions.some(...)은 평가되지 않으므로
  //   subregions를 그대로 참조해도 안전하다.
  const subregionValid =
    !!region && (!effectiveSubregionsReady || subregions.some((s) => s.region_code === subregionCode));
  const effectiveSubregionCode = subregionValid ? subregionCode : "";
  const effectiveRegion = effectiveSubregionCode || region;

  const query = useMemo(() => {
    const q: Record<string, string> = {
      // 위치를 얻으면 전체를 받아 화면에서 페이지를 나누므로, page를 1로 고정해 페이지를 넘겨도 다시 요청하지 않는다.
      page: userLoc ? "1" : String(page),
      size: String(DEFAULT_PAGE_SIZE),
      data_source: dataSource,
    };
    if (effectiveRegion) q.region = effectiveRegion;
    // 유형/요금 필터는 "운영 정보" 탭에서만 UI에 노출되므로, 실시간 탭일 때
    // URL에 남아있는 값은 무시한다 (탭 전환 시 URL 정리가 누락돼도 안전하도록).
    if (dataSource === "standard" && facilityType) q.facility_type = facilityType;
    if (dataSource === "standard" && feeType) q.fee_type = feeType;
    return q;
  }, [page, effectiveRegion, facilityType, feeType, dataSource, userLoc]);

  // 같은 query라도 위치 유무에 따라 받는 방식(한 페이지 / 전체)이 달라서 키에 함께 넣는다.
  const queryKey = useMemo(() => JSON.stringify([userLoc != null, query]), [query, userLoc]);

  const [fetched, setFetched] = useState<FetchedFacilities>({ mode: "page", res: EMPTY_RES });
  const [resolvedQueryKey, setResolvedQueryKey] = useState<string | null>(null);
  const [error, setError] = useState<UserError | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  // 오래된 전체 목록을 다시 받게 하는 트리거와, 다시 받을지 판단하는 값들. 화면에 그리지 않으므로 ref로 둔다.
  // - fetchedAllAtRef: 마지막으로 전체를 받은 시각(한 페이지 응답이면 null)
  // - requestInFlightRef: 목록 요청이 진행 중인지. 첫 로딩·필터 변경·갱신 모두 해당한다.
  //   요청 중에는 갱신을 시작하지 않아, 느린 네트워크에서 페이지를 넘길 때 받던 요청을 취소하고 겹쳐 받지 않는다.
  const [refreshTick, setRefreshTick] = useState(0);
  const fetchedAllAtRef = useRef<number | null>(null);
  const requestInFlightRef = useRef(false);

  // queryKey가 마지막으로 반영 완료된 값과 다르면 로딩 중이라는 뜻 — 렌더링 중 계산.
  // 오래된 목록을 다시 받을 때는 queryKey가 그대로라 로딩으로 치지 않고 지금 목록을 계속 보여 준다.
  const loading = resolvedQueryKey !== queryKey;

  // 진입 시 위치를 기다리지 않으므로 첫 로딩이 빠르다(서버가 bicycle_id 순으로 한 페이지를 준다).
  // 위치가 나중에 도착하면 현재 탭·필터의 시설 전체를 받아 브라우저에서 가까운 순으로 정렬한다.
  // 이용자 위치를 서버로 보내지 않기 위해서다(map/nearestSort.ts). 지역 필터를 골랐어도 그 안에서
  // 실제 이용자 위치 기준으로 정렬한다.
  useEffect(() => {
    let cancelled = false;
    // 이 queryKey의 목록을 이미 보여 주고 있으면 뒤에서 도는 갱신(refreshTick)이다.
    const isBackgroundRefresh = resolvedQueryKey === queryKey;
    // 갱신뿐 아니라 필터를 바꿔 새로 받는 중에도 켠다. 그사이 화면에 남은 이전 목록에서 페이지를 넘기면
    // 받은 시각이 아직 이전 조건 기준이라 갱신이 시작돼, 받던 요청을 취소하고 다시 받게 되기 때문이다.
    requestInFlightRef.current = true;

    const request: Promise<FetchedFacilities> = userLoc
      ? getAllBicycleFacilities(query).then((facilities) => ({ mode: "all", facilities }))
      : getBicycleFacilities(query).then((r) => ({ mode: "page", res: r }));
    request
      .then((result) => {
        if (cancelled) return;
        fetchedAllAtRef.current = result.mode === "all" ? Date.now() : null;
        setFetched(result);
        setError(null);
        setResolvedQueryKey(queryKey);
      })
      .catch((e) => {
        if (cancelled) return;
        // 이용자가 요청하지 않은 뒤쪽 갱신이 실패하면 보던 목록을 지우지 않고 조용히 넘긴다.
        // 받은 시각을 그대로 두어 다음 페이지 이동·탭 복귀 때 다시 시도한다.
        if (isBackgroundRefresh) return;
        setError(toUserError(e, "자전거 시설을 불러오지 못했어요"));
        // resolvedQueryKey는 갱신하지 않는다. 에러는 이 쿼리를 아직 성공적으로
        // 처리하지 못했다는 뜻이므로, retry() 호출 시 loading이 다시 true가
        // 되어 "불러오는 중..."이 뜨게 한다. 여기서 갱신하면 재시도 중에도
        // loading이 false로 계산되어 결과 없음 문구가 먼저 잘못 뜬다.
      })
      .finally(() => {
        if (!cancelled) requestInFlightRef.current = false;
      });
    return () => {
      cancelled = true;
      requestInFlightRef.current = false;
    };
    // query 대신 queryKey(query를 문자열화한 값)로 변경 여부를 비교한다. query 객체
    // 참조는 매 렌더 바뀔 수 있어도 queryKey가 같으면 재실행할 필요가 없으므로,
    // query는 의도적으로 deps에서 제외한다. refreshTick은 오래된 전체 목록을 다시 받을 때 바뀐다.
    // resolvedQueryKey는 요청을 시작한 시점의 값으로 갱신인지 판단하는 데만 쓰므로 deps에 넣지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, retryTick, refreshTick]);

  // 전체 목록이 오래됐고 다시 받는 중이 아니면 다시 받는다. 페이지 이동(아래 Pagination)과 탭 복귀 때 확인한다.
  // 다시 받는 요청도 위치와 상관없는 같은 전체 목록이라 위치가 드러나지 않는다.
  const refreshIfStale = () => {
    if (requestInFlightRef.current || !isAllListStale(fetchedAllAtRef.current, Date.now())) return;
    requestInFlightRef.current = true;
    setRefreshTick((t) => t + 1);
  };

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (requestInFlightRef.current || !isAllListStale(fetchedAllAtRef.current, Date.now())) return;
      requestInFlightRef.current = true;
      setRefreshTick((t) => t + 1);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // 전체를 받았으면 가까운 순으로 정렬한다. 정렬은 목록·위치가 바뀔 때만 다시 하고, 페이지 이동은 자르기만 한다.
  // 시설 좌표는 map_y가 위도, map_x가 경도다.
  const sortedAll = useMemo(() => {
    if (fetched.mode !== "all") return null;
    if (!userLoc) return fetched.facilities;
    return sortByDistance(fetched.facilities, userLoc, (f) => ({ lat: f.map_y, lng: f.map_x }));
  }, [fetched, userLoc]);

  const res = useMemo<BicycleFacilityListResponse>(() => {
    if (!sortedAll) return fetched.mode === "page" ? fetched.res : EMPTY_RES;
    return {
      total_count: sortedAll.length,
      page,
      size: DEFAULT_PAGE_SIZE,
      facilities: slicePage(sortedAll, page, DEFAULT_PAGE_SIZE),
    };
  }, [sortedAll, fetched, page]);

  // 받아 둔 한 페이지 응답이 지금 페이지와 다르면 그 목록을 보여 주지 않고 로딩으로 둔다.
  // 위치를 얻어 전체 목록을 받는 중에 페이지를 넘기면 요청 page가 1로 고정돼 새 요청이 없어서,
  // 그대로 두면 전체 목록이 올 때까지 페이지 번호만 바뀌고 카드는 이전 페이지로 남는다(CourseExplore와 같은 처리).
  const pageMismatch = fetched.mode === "page" && fetched.res.page !== page;

  const retry = () => {
    // 클릭 시점에 현재 지역/탭의 세부 지역 실패까지 확인된 경우에만 함께 재요청한다.
    // 세부 지역 요청이 아직 진행 중이면 그대로 두고 목록만 재요청한다.
    // 이후 세부 지역 요청이 실패하면 당시 목록 오류 상태에 따라 전용 아이콘 또는
    // 목록 재시도로 처리한다. 한 번의 클릭이 이후 도착할 실패까지 처리하거나,
    // 두 요청의 성공을 보장하는 것은 아니다.
    if (subregionsErrorForCurrent) {
      setSubregionsErrorKey(null);
      retrySubregions();
    }
    setError(null);
    setRetryTick((t) => t + 1);
  };

  // 페이지 이동 시 스크롤을 맨 위로 (새 페이지의 첫 카드부터 보이도록)
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(res.total_count / DEFAULT_PAGE_SIZE));

  useEffect(() => {
    if (loading || error || res.total_count === 0 || page <= totalPages) return;
    const params: Record<string, string> = { page: String(totalPages), source: dataSource };
    if (region) params.region = region;
    if (subregionCode) params.gu = subregionCode;
    if (facilityType) params.type = facilityType;
    if (feeType) params.fee = feeType;
    setSearchParams(params, { replace: true });
  }, [loading, error, res.total_count, page, totalPages, region, subregionCode, facilityType, feeType, dataSource, setSearchParams]);

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
    // region/subregionCode는 탭이 바뀌어도 유지 (지역은 탭과 무관한 필터이므로)
    if (region) params.region = region;
    if (subregionCode) params.gu = subregionCode;
    if (next === "운영 정보" && facilityType) params.type = facilityType;
    if (next === "운영 정보" && feeType) params.fee = feeType;
    setSearchParams(params);
  };

  return (
    <>
      <AppHeader />
      <div className="px-[max(1rem,calc((100%-72rem)/2+1rem))] pt-4 pb-4">
        <h1 className="mb-3 text-xl font-bold text-gray-900">자전거 대여소</h1>

        <div className="mb-3">
          <BicycleTabs value={activeTab} onChange={changeTab} />
        </div>

        <div className="grid grid-cols-2 items-start gap-2 min-[632px]:flex min-[632px]:flex-wrap">
          <BicycleRegionSelect
            value={region}
            onChange={changeRegion}
            regions={regionOptions}
            className={`${SELECT_CLASS} w-full min-[632px]:w-[140px]`}
          />

          <div className="relative w-full min-[632px]:w-[140px]">
            <BicycleRegionSelect
              value={effectiveSubregionCode}
              onChange={changeSubregion}
              regions={subregionOptions}
              placeholder={
                !region
                  ? "지역을 먼저 선택"
                  : subregionsErrorForCurrent
                    ? "불러오기 실패"
                    : !effectiveSubregionsReady
                      ? "불러오는 중"
                      : subregionOptions.length === 0
                        ? "세부 지역 없음"
                        : "전체 세부 지역"
              }
              disabled={
                !region ||
                subregionsErrorForCurrent ||
                !effectiveSubregionsReady ||
                subregionOptions.length === 0
              }
              className={`${SELECT_CLASS} w-full disabled:cursor-not-allowed disabled:opacity-50 ${subregionsErrorForCurrent && !error ? "appearance-none pr-9" : ""}`}
            />
            {/* 현재 지역/탭의 세부 지역만 실패하고 목록 오류가 없을 때 아이콘을 표시한다.
                세부 지역 오류가 먼저 도착하면 아이콘이 보일 수 있으나, 목록 오류도
                도착하면 숨기고 ErrorNotice의 재시도만 표시한다. 목록 재시도 후 늦게
                세부 지역 실패가 확인된 경우에도 같은 조건을 적용한다.
                두 재시도 UI는 동시에 표시하지 않으며, 함께 재요청할지는 retry()의
                클릭 시점 상태로 결정한다. 목록과 세부 지역이 동시에 실패했을 때 두 버튼을 같이 보여주면,
                아이콘을 먼저 눌러도 목록 오류는 그대로 남아 ErrorNotice 버튼을 한 번 더 눌러야 한다.
                그 번거로움을 없애려고 아이콘은 숨기고 ErrorNotice 버튼 하나만 남긴다.*/}
            {region && subregionsErrorForCurrent && !error && (
              <button
                type="button"
                onClick={retrySubregions}
                aria-label="세부 지역 다시 불러오기"
                title="세부 지역 다시 불러오기"
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-caption hover:bg-gray-100 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              >
                <RotateCw size={16} aria-hidden="true" />
              </button>
            )}
          </div>

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
          {fetched.mode === "all" && userLoc && " · 가까운 순"}
        </p>

        {error ? (
          <ErrorNotice title={error.title} description={error.description} onRetry={retry} />
        ) : (loading && res.facilities.length === 0) || pageMismatch ? (
          // 데이터가 아예 없을 때(최초 진입 등)와 받아 둔 목록이 지금 페이지가 아닐 때만 로딩 문구를 보여준다.
          // 필터·탭이 바뀌어 재조회되는 중에는 이전 목록을 그대로 유지해
          // "불러오는 중..."으로 화면이 깜빡이며 지워지는 것을 막는다.
          // 다만 2페이지 이상에서 바꿔 1페이지로 돌아가면 받아 둔 목록이 1페이지가 아니라서 로딩으로 둔다.
          <p className="py-10 text-center text-sm text-gray-400">불러오는 중...</p>
        ) : (
          <BicycleList facilities={res.facilities} variant={dataSource as "standard" | "realtime"} />
        )}

        {!error && res.facilities.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={(nextPage) => {
              refreshIfStale();
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
