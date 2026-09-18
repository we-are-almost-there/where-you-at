import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { FeatureCollection, Geometry, Position } from "geojson";
import { useSearchParams } from "react-router";
import {
  buildRegionIndex,
  polygonsOf,
  type RegionEntry,
  type RegionIndex,
} from "../regionMatch";
import { fetchActiveRegionCodes } from "../supportApi";
import { toUserError, type UserError } from "../../../components/error/userError";
import { fetchOrNetworkError } from "../../../lib/http";
import { SupportErrorText } from "./SupportErrorText";
// 코스 탐색·자전거 대여소와 같은 축약을 쓴다.
// 같은 시도가 화면마다 다른 이름으로 불리지 않게 공용 표를 따른다.
import { SIDO_ABBR } from "../../../lib/regionLabels";

// viewBox는 고정하지 않고 그리는 대상의 비율에 맞춰 뷰마다 계산한다.
// 고정하면 가로로 긴 도(강원 등)에서 위아래에 큰 죽은 여백이 생긴다.
// VIEW_BASE는 긴 변의 크기(패딩 제외) — 좌표 정밀도 기준일 뿐 화면 크기와는 무관하다.
const VIEW_BASE = 780;
const PAD = 10;

const COLOR_HOVER = "#6C5CE7"; // --color-accent (SVG fill이라 토큰 클래스 대신 값으로)
const COLOR_INACTIVE = "#F1EFFC"; // --color-lavender (전국뷰의 미해당 시도)
const COLOR_INACTIVE_HOVER = "#E0DBF7"; // 위와 같되 누를 수 있을 때의 hover (한 톤 어둡게)
const COLOR_SIGUNGU = "#C9B8F0"; // 시도 색을 못 찾았을 때의 폴백 채움
const COLOR_OFF = "#DFE3E8"; // 시도뷰의 미해당 시군구 (회색)
const COLOR_OFF_HOVER = "#CBD2DA"; // 회색이지만 누를 수 있는 지역의 hover (한 톤 어둡게)
const COLOR_OFF_STROKE = "#CFD5DC"; // 회색 지역끼리의 경계선

// 본토를 크게 그리기 위한 인셋. 전국뷰 bbox가 울릉도(130.9°E)·백령도(124.6°E)·
// 제주(33.1°N) 때문에 부풀어서, 본토가 실제로 쓸 수 있는 폭의 3분의 2로 그려지고 있었다.
// 창(WINDOW) 안쪽 좌표는 손대지 않고, 밖으로 나간 거리만 압축해 창 쪽으로 붙인다.
// 종이 지도가 울릉도·제주를 인셋 박스로 빼는 것과 같은 관례 — 지리 비율은 의도적으로 포기한다.
// 압축률은 경도·위도를 따로 둔다. 좌우(울릉도·백령도)는 세게 당겨 가로 낭비를 줄이고,
// 제주는 약하게 당겨 본토와 충분히 떨어진 남쪽에 남긴다.
const WINDOW_LNG: [number, number] = [125.6, 129.7];
const WINDOW_LAT: [number, number] = [34.2, 38.7];
const INSET_COMPRESS_LNG = 0.16;
const INSET_COMPRESS_LAT = 0.5;

// 등장방형 보정. 위도 36°(본토 중심)에서 경도 1°는 위도 1°의 약 0.81배 거리라,
// 보정하지 않으면 본토가 가로로 1.2배 늘어난다.
const COS_LAT0 = Math.cos((36 * Math.PI) / 180);

function clampToWindow(v: number, [lo, hi]: [number, number], compress: number): number {
  if (v < lo) return lo + (v - lo) * compress;
  if (v > hi) return hi + (v - hi) * compress;
  return v;
}

/**
 * 폴리곤을 인셋 규칙에 맞춰 옮긴 링 배열로 편다.
 * 좌표를 하나씩 압축하면 섬 모양이 찌그러지므로, 폴리곤 중심의 이동량만큼
 * 링 전체를 평행이동해 모양과 구멍 정렬을 그대로 유지한다.
 * bbox 계산과 path 생성이 반드시 같은 함수를 거쳐야 좌표계가 어긋나지 않는다.
 */
function insetRings(geom: Geometry): Position[][] {
  const rings: Position[][] = [];
  for (const poly of polygonsOf(geom)) {
    const shell = poly[0];
    let sx = 0, sy = 0;
    for (const [lng, lat] of shell) { sx += lng; sy += lat; }
    const cx = sx / shell.length;
    const cy = sy / shell.length;
    const dLng = clampToWindow(cx, WINDOW_LNG, INSET_COMPRESS_LNG) - cx;
    const dLat = clampToWindow(cy, WINDOW_LAT, INSET_COMPRESS_LAT) - cy;
    if (dLng === 0 && dLat === 0) {
      for (const ring of poly) rings.push(ring);
    } else {
      for (const ring of poly) rings.push(ring.map(([lng, lat]) => [lng + dLng, lat + dLat]));
    }
  }
  return rings;
}

// 시도별 색상 (활성 시도만)
const SIDO_COLOR: Record<string, string> = {
  "41": "#A9C7F5", // 경기 - 파랑
  "51": "#7FD1C4", // 강원 - 청록
  "43": "#C4A9E8", // 충북 - 보라
  "44": "#F5B8D0", // 충남 - 분홍
  "52": "#A9E0A0", // 전북 - 연두
  "12": "#F5C98F", // 전남 - 주황
  "47": "#F5A9A9", // 경북 - 살구
  "48": "#B8D98F", // 경남 - 올리브
  "28": "#8FC9F5", // 인천 - 하늘
  "26": "#F5E08F", // 부산 - 노랑
  "27": "#D9A0D9"  // 대구 - 자주
};


// 배지의 화면상 글자 크기(CSS px). viewBox가 축소돼도 이 크기를 유지한다.
const BADGE_FONT_PX = 12;
// 충돌 간격 박스 높이 (글자 크기 배수 — 폰트만 바꾸면 같이 따라온다).
// 알약 높이가 약 1.5em이므로 2.4em이면 서로 닿지 않으면서 촘촘히 앉을 수 있다.
// 시도뷰는 라벨이 20개 넘게 들어와서 그 값을 쓴다 — 더 크면 세로로 3~4줄밖에 못 들어가 겹친다.
// 전국뷰는 대구처럼 다른 도 안에 들어앉은 시가 모도(경북) 라벨과 붙지 않도록 조금 더 띄운다.
// 예전에는 5.5em이었는데, 지원 대상이 없는 시도까지 16곳 모두 이름을 달자 이 간격이 수도권·
// 충청권 배지를 옆 시도 땅으로 밀어냈다(지도 폭 327px인 375 화면에서 8곳). 3em에서 2곳
// (서울·세종 — 도형 자체가 배지보다 작다)으로 줄고 겹침은 없다.
const BADGE_H_EM_NATION = 3;
const BADGE_H_EM_SIDO = 2.4;
// 배지 폭은 이름 길이로 각자 계산한다. 전부 같은 폭으로 잡으면 '고성군' 같은 짧은 이름이
// '전남광주통합특별시' 기준으로 밀려나 필요 이상으로 흩어진다.
// 미해당 지역은 알약 없이 글자만 그리므로 좌우 패딩(약 1.3em)만큼 폭이 준다.
const badgeWidthEm = (name: string, active: boolean) => name.length + (active ? 1.8 : 0.4);

/**
 * 누르면 할 일.
 *   sido    그 도로 드릴다운한다 (전국뷰)
 *   region  지역 패널을 연다 (시도뷰의 시군구, 그리고 하위가 하나뿐인 세종).
 *           sido가 있으면 지도도 그 도로 함께 들어간다 — 전국뷰에서 바로 패널을 여는 세종용.
 * null이면 누를 수 없다 — 대응하는 DB 지역이 없어 패널을 열 수 없는 도형뿐이다.
 */
type MapGo =
  | { kind: "sido"; code: string }
  | { kind: "region"; code: string; sido?: string }
  | null;

/** 지도에 그릴 한 조각. 전국뷰는 시도, 시도뷰는 시군구가 들어온다. */
type MapItem = {
  key: string;
  geometry: Geometry;
  /** 배지에 적는 이름. 전국뷰는 시도명을 줄여 쓴다('서울특별시' → '서울') */
  name: string;
  /** 줄이기 전 이름. 보조기기에는 이 이름까지 읽어 준다. 줄이지 않았으면 name과 같다 */
  fullName: string;
  /** 색칠 여부 — 지금 신청 가능한 제도가 있는가 */
  active: boolean;
  /**
   * 누르면 할 일. 색칠 여부와는 무관하다 — 회색이어도 패널에는 보여줄 게 있다
   * (제도 없음 안내 + 그 지역 코스 링크).
   */
  go: MapGo;
};

/** 정적 파일에서 한 번만 만들어 두는 것들. 활성 지역 조회와 수명이 다르다. */
type MapData = {
  sido: FeatureCollection;
  regions: RegionEntry[];
  /** 활성 지역 조회가 실패했을 때 쓸 폴백 코드 목록 */
  supportRegions: ReadonlySet<string>;
};

/** 활성 지역 조회 상태. loading을 ready·failed와 구분해야 낡은 색칠을 안 보여준다. */
type ActiveState =
  | { status: "loading" }
  | { status: "ready"; codes: ReadonlySet<string> }
  | { status: "failed" };

// 지도 데이터가 오기 전에는 색칠할 대상이 없다. 매 렌더 새 Set을 만들면 useMemo가 헛돈다.
const EMPTY_CODES: ReadonlySet<string> = new Set();

/** 주어진 시군구 코드들이 속한 시도 코드 집합 */
function sidoCodesOf(
  regions: RegionEntry[] | null,
  codes: ReadonlySet<string>,
): Set<string> {
  const set = new Set<string>();
  for (const r of regions ?? []) {
    if (r.regionCode && codes.has(r.regionCode) && r.sidoCode) set.add(r.sidoCode);
  }
  return set;
}

export function SupportRegionMap() {
  const [, setSearchParams] = useSearchParams();
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [svgPxWidth, setSvgPxWidth] = useState(VIEW_BASE);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [error, setError] = useState<UserError | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedSido, setSelectedSido] = useState<string | null>(null); // null=전국

  // 진행 중인 제도가 있는 지역 조회 상태.
  // loading을 따로 두는 이유: 응답을 기다리는 동안 폴백 목록으로 색칠해 버리면
  // 사용자는 아무 표시 없이 낡은 색칠을 최신 정보로 믿게 된다. 그동안은 아무것도
  // 활성으로 두지 않고 확인 중이라고 알린다.
  const [active, setActive] = useState<ActiveState>({ status: "loading" });
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const load = (url: string) =>
      fetchOrNetworkError(url).then((r) => {
        if (!r.ok) throw new Error(`지도 로드 실패 (${r.status})`);
        return r.json();
      });

    let cancelled = false;
    Promise.all([
      load("/korea-sido.json"),
      load("/korea-all-regions.json"),
      load("/region-index.json"),
    ])
      .then(([sd, all, index]: [FeatureCollection, FeatureCollection, RegionIndex]) => {
        if (cancelled) return;
        setMapData({
          sido: sd,
          // 도형 계산은 여기서 한 번만. 활성 지역을 다시 받아도 이 결과는 그대로 쓴다.
          regions: buildRegionIndex(all, sd, index.byShape),
          supportRegions: new Set(index.supportRegions),
        });
      })
      .catch((err) => {
        if (!cancelled) setError(toUserError(err, "지도를 불러오지 못했어요"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 활성 지역 조회. 지도 도형과 달리 실패해도 지도는 떠야 하므로 따로 다룬다.
  //
  // 최초 조회와 '다시 시도'가 같은 요청을 내므로 진행 중인 요청을 한 곳에 담아 둔다.
  // 이게 실제로 버는 것은 두 가지다.
  //   1) 화면을 떠날 때 진행 중인 요청을 끊는다. 지도는 라우트 안에서 마운트·언마운트가
  //      반복되고, 조회는 최대 8초를 기다린다 — 떠난 화면의 응답이 돌아와 setState를 하면
  //      React가 경고하기 전에 이미 죽은 상태를 되살린 뒤다.
  //   2) 호출자가 늘어도 마지막 요청만 화면에 반영된다.
  // 지금 UI만 놓고 보면 최초 조회와 재시도가 겹칠 일은 없다 — '다시 시도'는 failed일 때만
  // 그려지고 disabled={retrying}로 중복 클릭도 막혀 있다. 2)는 그 UI 조건이 풀렸을 때를
  // 위한 것이지, 지금 도달 가능한 경합을 막고 있는 게 아니다.
  const activeReq = useRef<AbortController | null>(null);

  // 반환값은 "이 응답을 화면에 반영했는가". 새 요청이나 언마운트에 밀려난 응답은
  // 상태를 건드리지 않으므로 호출한 쪽도 뒷정리를 건너뛰어야 한다.
  // async/await 대신 then 체인인 이유: 상태 갱신이 콜백 안에 있어야 이 함수를
  // 이펙트에서 곧장 불러도 "이펙트 본문에서 동기 setState" 검사에 걸리지 않는다.
  const loadActiveCodes = useCallback((): Promise<boolean> => {
    activeReq.current?.abort();
    const controller = new AbortController();
    activeReq.current = controller;
    const applied = () => !controller.signal.aborted;
    // 제한 시간을 넘기면 fetch가 거부되어 failed로 떨어진다 — 폴백 색칠과 다시 시도가 뜬다
    return fetchActiveRegionCodes(controller.signal)
      .then((codes) => {
        if (applied()) setActive({ status: "ready", codes: new Set(codes) });
      })
      .catch(() => {
        if (applied()) setActive({ status: "failed" });
      })
      .then(applied);
  }, []);

  useEffect(() => {
    void loadActiveCodes();
    return () => activeReq.current?.abort();
  }, [loadActiveCodes]);

  // 최초 조회와 달리 재시도는 눌린 걸 알려야 한다 (지도가 이미 떠 있어서 기다리는
  // 티가 안 난다). 그 진행 표시만 여기서 얹는다.
  const retryActiveCodes = () => {
    setRetrying(true);
    void loadActiveCodes().then((applied) => {
      if (applied) setRetrying(false);
    });
  };

  // 색칠 대상.
  //   ready   조회 결과 그대로
  //   failed  폴백 목록. 기간·차수를 모르므로 끝난 제도가 섞이고, 그래서 안내를 띄운다
  //   loading 아직 판단할 근거가 없다. 낡은 색을 잠깐 보여주느니 비워 둔다
  const supportCodes =
    active.status === "ready"
      ? active.codes
      : active.status === "failed"
        ? (mapData?.supportRegions ?? EMPTY_CODES)
        : EMPTY_CODES;

  const regions = mapData?.regions ?? null;
  const sido = mapData?.sido ?? null;

  // 지도는 시군구 단위 도형만 가진다(#64에서 행정구를 시 단위로 병합). 지원 제도도
  // 시군구 단위로만 걸리므로 그릴 수 없는 활성 지역은 나올 수 없다.
  //
  // 그 계약은 빌드 때 강제된다. support_region에 쓰는 경로는 03_support_seed.sql
  // 하나뿐이고, scripts/build-region-index.mjs가 시드에 적힌 지역이 전부 도형에
  // 있는지 검사해 없으면 build를 실패시킨다.
  //
  // 그래도 DB를 직접 고치면 검사를 지나칠 수 있어, 그때 조용히 사라지지 않도록 로그만 남긴다.
  useEffect(() => {
    if (active.status !== "ready" || !regions) return;
    const drawable = new Set(regions.map((r) => r.regionCode).filter(Boolean));
    const missing = [...active.codes].filter((code) => !drawable.has(code));
    if (missing.length) {
      console.warn(
        `[지원금 지도] 활성 지역 ${missing.length}곳에 대응하는 도형이 없습니다.` +
          ` 지도는 시군구 단위라, 제도가 행정구 단위로 걸렸는지 확인하세요:`,
        missing,
      );
    }
  }, [active, regions]);

  // SVG가 실제로 몇 CSS px로 그려지는지 추적한다.
  // foreignObject 안의 px는 viewBox 단위라 화면 축소 배율만큼 같이 작아지는데,
  // 배지 글자는 지도와 같이 작아지면 안 되므로 이 값으로 역보정한다.
  // ResizeObserver의 contentRect는 SVG에서 신뢰할 수 없어 항상 rect를 직접 읽는다.
  // 컨테이너와 svg를 모두 관찰하고 window resize까지 듣는다 — 셋 중 하나만 놓쳐도
  // 배지 크기가 이전 화면 폭에 멈춰버린다.
  //
  // 구독 시점을 mapReady에 맞춘다. 데이터가 오기 전에는 아래에서 조기 반환하므로
  // boxRef·svgRef가 아직 null이고, 이 값이 서는 렌더가 곧 지도가 처음 그려지는 렌더다.
  // 의존성을 []로 두면 관찰 대상이 없는 채로 끝나 배지가 초기 폭(VIEW_BASE)에 멈추고,
  // 아예 빼면 hover처럼 폭과 무관한 렌더마다 재구독된다.
  // 이후의 폭 변화(패널 개폐·창 크기·브레이크포인트)는 ResizeObserver와 resize가 맡는다.
  const mapReady = sido != null && regions != null;
  useEffect(() => {
    if (!mapReady) return;
    const measure = () => {
      const w = svgRef.current?.getBoundingClientRect().width ?? 0;
      // 같은 값이면 setState가 바로 빠져나가므로 렌더 루프가 생기지 않는다
      setSvgPxWidth((prev) => (w > 0 && Math.abs(prev - w) > 0.5 ? w : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (boxRef.current) ro.observe(boxRef.current);
    if (svgRef.current) ro.observe(svgRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [mapReady]);

  // 현재 뷰에서 그릴 항목들. 전국뷰는 시도, 시도뷰는 그 도의 시군구 전체를 그린다
  // (지원 대상이 아닌 시군구도 회색으로 깔아야 도의 윤곽이 살아난다).
  // 지원 지역을 가진 시도. 하드코딩하면 제도가 끝나 빈 도가 돼도 계속 색칠된다.
  const activeSidoCodes = useMemo(
    () => sidoCodesOf(regions, supportCodes),
    [regions, supportCodes],
  );
  // 시도별 하위 시군구 도형. 드릴다운해서 볼 게 있는지 판단에 쓴다.
  // 값이 null인 항목은 도형은 있지만 대응하는 DB 지역이 없는 경우다.
  const subRegionsBySido = useMemo(() => {
    const map = new Map<string, (string | null)[]>();
    for (const r of regions ?? []) {
      if (!r.sidoCode) continue;
      const list = map.get(r.sidoCode);
      if (list) list.push(r.regionCode);
      else map.set(r.sidoCode, [r.regionCode]);
    }
    return map;
  }, [regions]);

  // 클릭은 색칠과 묶지 않는다. 색은 "지금 신청 가능한 제도가 있는가"라 조회 결과에
  // 따라 변하지만, 누를 수 있는지는 대응하는 DB 지역이 있는지만 보면 된다 — 회색이어도
  // 패널에는 보여줄 게 있다(제도 없음 안내 + 그 지역 코스 링크).
  //
  // 예전에는 인구감소지역 목록(supportRegions)으로 클릭을 가렸다. 같은 회색인데
  // 어디는 눌리고 어디는 안 눌려, 무엇이 기준인지 화면만 보고는 알 수 없었다.
  // 색칠과 클릭이 갈라져 "보이는데 안 눌리는" 지역이 생기는 문제도 함께 없앤다.
  const viewItems = useMemo((): MapItem[] => {
    if (selectedSido == null) {
      return (sido?.features ?? []).map((f) => {
        const code = String(f.properties?.sido_code);
        const fullName = String(f.properties?.sido_name);
        const sub = subRegionsBySido.get(code) ?? [];
        // 하위 도형이 하나뿐인 시도(세종)는 드릴다운만 하면 같은 땅 하나를 한 번 더 눌러야
        // 한다. 한 번에 그 도로 들어가면서 패널까지 연다. 패널만 열고 지도를 전국뷰에 두면
        // 머리말은 '지역을 선택하세요'인데 패널은 세종이고, 거기서 다른 시도를 누르면
        // 지도와 패널이 서로 다른 지역을 가리킨다. 도로 들어가 두면 다른 곳으로 가는 길은
        // URL을 비우는 '← 전국으로'뿐이라 둘이 어긋날 수 없다.
        const go: MapGo =
          sub.length === 1
            ? sub[0] != null
              ? { kind: "region", code: sub[0], sido: code }
              : null
            : sub.length > 1
              ? { kind: "sido", code }
              : null;
        return {
          key: code,
          geometry: f.geometry,
          // 16곳 모두 이름을 달면 좁은 화면에서 충돌 해소가 수도권·충청권 배지를 옆 시도
          // 땅으로 밀어낸다(375px에서 8곳). 전국뷰에는 시도만 나오므로 줄여도 뜻이 흐려지지 않는다.
          name: SIDO_ABBR[fullName] ?? fullName,
          fullName,
          active: activeSidoCodes.has(code),
          go,
        };
      });
    }
    return (regions ?? [])
      .filter((r) => r.sidoCode === selectedSido)
      .map((r) => ({
        key: `${selectedSido}-${r.feature.properties?.sgg_code ?? r.name}`,
        geometry: r.feature.geometry,
        name: r.name,
        fullName: r.name,
        active: r.regionCode != null && supportCodes.has(r.regionCode),
        go: r.regionCode != null ? ({ kind: "region", code: r.regionCode } as const) : null,
      }));
  }, [selectedSido, sido, regions, activeSidoCodes, subRegionsBySido, supportCodes]);

  // 현재 뷰 대상의 경위도 범위에 맞춰 projection 계산 (전국이든 시도든).
  // 인셋을 적용한 좌표 기준으로 bbox를 잡으므로, project에 넘기는 좌표도
  // 반드시 insetRings를 통과한 값이어야 한다.
  const { project, viewW, viewH } = useMemo(() => {
    if (!viewItems.length) {
      return { project: null, viewW: VIEW_BASE, viewH: VIEW_BASE };
    }
    let minX = Infinity, maxX = -Infinity, minLat = Infinity, maxLat = -Infinity;
    viewItems.forEach((f) => {
      insetRings(f.geometry).forEach((ring) =>
        ring.forEach(([lng, lat]) => {
          const x = lng * COS_LAT0;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }),
      );
    });
    const dX = maxX - minX;
    const dY = maxLat - minLat;
    // 긴 변을 VIEW_BASE에 맞추고, 짧은 변은 비율대로 — viewBox가 콘텐츠에 딱 맞으니 여백이 없다
    const scale = VIEW_BASE / Math.max(dX, dY);
    const proj = ([lng, lat]: number[]): [number, number] => [
      PAD + (lng * COS_LAT0 - minX) * scale,
      PAD + (maxLat - lat) * scale,
    ];
    return {
      project: proj,
      viewW: dX * scale + PAD * 2,
      viewH: dY * scale + PAD * 2,
    };
  }, [viewItems]);

  // viewBox 단위 / CSS px. 모바일처럼 지도가 작게 그려질수록 1보다 커진다.
  const unitPerPx = viewW / svgPxWidth;
  const badgeFont = BADGE_FONT_PX * unitPerPx;

  const toPath = (geom: Geometry, proj: (p: Position) => [number, number]): string =>
    insetRings(geom)
      .map(
        (ring) =>
          ring.map((pt, i) => {
            const [x, y] = proj(pt);
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          }).join("") + "Z",
      )
      .join("");

  // 배지 위치 (중심 좌표).
  // 전국·시도 모두 그리는 조각 전부에 이름을 단다. 지원 대상 여부로 거르면
  // 서울·대전·울산·세종·제주가 이름 없는 땅으로 남아, 어디가 어디인지 알려면
  // 눌러 봐야 한다 — 지도에서 지역명은 색칠과 별개로 필요한 정보다.
  const badges = useMemo(() => {
    if (!project) return [];
    return viewItems.map((it) => {
      const rings = insetRings(it.geometry);
      // 가장 큰 링의 중심 (작은 섬 말고 본체에 배지)
      let best = rings[0];
      for (const ring of rings) if (ring.length > best.length) best = ring;
      let sx = 0, sy = 0, n = 0;
      best.forEach((pt) => {
        const [x, y] = project(pt);
        sx += x; sy += y; n++;
      });
      return {
        key: it.key, name: it.name, fullName: it.fullName, active: it.active, go: it.go,
        cx: sx / n, cy: sy / n,
      };
    });
  }, [viewItems, project]);

  // 배지 충돌 해소 (전국·시도 공통).
  // 배지가 화면상 고정 크기라 viewBox 단위 크기는 축소 배율만큼 커진다 — 간격도 같이 키운다.
  const badgePositions = useMemo(() => {
    if (!badges.length) return [];
    const BADGE_H =
      (selectedSido == null ? BADGE_H_EM_NATION : BADGE_H_EM_SIDO) * badgeFont;
    const nodes = badges.map((b) => ({
      ...b,
      x: b.cx, y: b.cy, ox: b.cx, oy: b.cy,
      halfW: (badgeWidthEm(b.name, b.active) * badgeFont) / 2,
    }));

    for (let iter = 0; iter < 300; iter++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          // 두 배지의 반폭 합만큼만 떨어지면 된다
          const ox = a.halfW + b.halfW - Math.abs(dx);
          const oy = BADGE_H - Math.abs(dy);
          if (ox > 0 && oy > 0) {
            if (ox < oy) {
              const push = (ox / 2) * (dx < 0 ? -1 : 1);
              a.x -= push; b.x += push;
            } else {
              const push = (oy / 2) * (dy < 0 ? -1 : 1);
              a.y -= push; b.y += push;
            }
            moved = true;
          }
        }
      }
      // 경계 가두기를 반복 안에서 함께 한다. 마지막에 한 번만 하면 되밀린 배지가
      // 다시 겹친 채로 끝난다.
      const halfH = BADGE_H / 2;
      for (const n of nodes) {
        n.x = Math.min(Math.max(n.x, n.halfW), viewW - n.halfW);
        n.y = Math.min(Math.max(n.y, halfH), viewH - halfH);
      }
      if (!moved) break;
    }
    return nodes;
  }, [badges, badgeFont, viewW, viewH, selectedSido]);

  // 조각을 눌렀을 때와 배지를 눌렀을 때가 갈리면 같은 지역이 두 가지로 움직인다.
  const goTo = (go: MapGo) => {
    if (!go) return;
    if (go.kind === "sido") return setSelectedSido(go.code);
    if (go.sido) setSelectedSido(go.sido);
    setSearchParams({ region: go.code });
  };

  /**
   * 배지를 읽어 줄 이름. 줄인 이름이면 원래 이름을 들려준다.
   * 다만 화면 글자로 시작하게 둔다 — 음성으로 조작하는 사람은 보이는 글자('경남')로
   * 부르는데, 이름표가 '경상남도'뿐이면 그 말로는 이 버튼을 찾지 못한다.
   */
  const spokenName = (b: { name: string; fullName: string }) =>
    b.fullName.startsWith(b.name) ? b.fullName : `${b.name}, ${b.fullName}`;

  /**
   * 회색 배지가 왜 회색인지. 알약(활성)은 이름만으로 뜻이 통하므로 null이다.
   * 조회가 끝나기 전에는 제도가 없는지 모른다. 화면에는 '확인 중' 칩이 떠 있지만
   * 배지만 듣는 사람에게는 그 문맥이 없으므로, 아직 모르는 사실을 단정하지 않는다.
   */
  const badgeNote = (b: { active: boolean; go: MapGo }): string | null =>
    b.go == null
      ? "선택할 수 없음"
      : b.active
        ? null
        : active.status === "ready"
          ? "진행 중인 제도 없음"
          : "신청 정보 확인 중";

  if (error) return <SupportErrorText error={error} className="py-16" />;
  if (!sido || !regions)
    return <p className="py-16 text-center text-[14px] text-caption">지도를 불러오는 중…</p>;

  const selectedSidoName =
    selectedSido != null
      ? sido.features.find((f) => f.properties?.sido_code === selectedSido)?.properties
          ?.sido_name
      : null;

  // 시도 뷰에서 쓸 그 도의 색 (시군구 채움·배지 연결선에 공통 적용)
  const sidoColor = (selectedSido && SIDO_COLOR[selectedSido]) || COLOR_SIGUNGU;

  return (
    /* 칩은 바깥(컬럼 폭) 기준, 지도는 안쪽(mx-auto)에서 가운데 —
       한 박스에 두면 칩이 지도를 따라 가운데로 끌려간다. */
    <div ref={boxRef} className="relative w-full">
      {/* 헤더 / 뒤로 — 바다 위라 유리판 칩으로 대비 확보. 좌측은 제목 칩과 같은 선에 맞춘다.
          모바일은 지도가 작아 띄우면 상단 시군구 배지를 가리므로 일반 흐름에 두어
          지도를 칩 높이만큼만 밀어낸다. md+는 여유가 있어 그대로 띄운다. */}
      <div className="mb-2 flex w-fit items-center gap-2 rounded-lg bg-white/65 px-3.5 py-1.5 ring-1 ring-white/70 backdrop-blur-sm md:absolute md:left-0 md:top-0 md:z-10 md:mb-0">
        {selectedSido != null && (
          <button
            type="button"
            onClick={() => {
              setSelectedSido(null);
              setHovered(null);
              // 지도만 전국으로 돌리고 URL을 그대로 두면, 전국뷰인데 우측에는
              // 직전에 고른 시군구 패널이 그대로 남는다. region·support를 함께 비운다.
              setSearchParams({});
            }}
            className="cursor-pointer text-[13px] text-caption transition-colors hover:text-ink"
          >
            ← 전국으로
          </button>
        )}
        <span className="text-[15px] font-bold text-ink">
          {selectedSido == null ? "지역을 선택하세요" : selectedSidoName}
        </span>
      </div>

      {/* 색칠이 최신 정보가 아닌 동안에는 그 사실을 항상 드러낸다.
          조용히 넘어가면 사용자는 지금 보이는 색을 최신으로 믿는다.
          지도는 그대로 쓸 수 있으므로 막지 않고 칩으로 얹는다. */}
      {active.status !== "ready" && (
        <div
          role="status"
          className="mb-2 flex w-fit items-center gap-2 rounded-lg bg-white/80 px-3.5 py-1.5 ring-1 ring-white/70 backdrop-blur-sm md:absolute md:right-0 md:top-0 md:z-10 md:mb-0"
        >
          <span className="text-[12px] text-caption">
            {active.status === "loading"
              ? "최신 신청 정보를 확인하는 중이에요."
              : "최신 신청 정보를 불러오지 못해 일부 지역이 실제와 다를 수 있어요."}
          </span>
          {active.status === "failed" && (
            <button
              type="button"
              onClick={retryActiveCodes}
              disabled={retrying}
              className="shrink-0 cursor-pointer text-[12px] font-bold text-accent transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {retrying ? "확인 중…" : "다시 시도"}
            </button>
          )}
        </div>
      )}

      {/* 배경은 페이지 전체에 깔린 SeaBackdrop이 담당하므로 지도 자체는 투명하다 */}
      <div className="mx-auto w-full max-w-3xl px-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewW.toFixed(1)} ${viewH.toFixed(1)}`}
        className="h-auto w-full"
      >
        {project &&
          viewItems.map((it) => {
            const nation = selectedSido == null;
            // 활성: 전국뷰는 시도색, 시도뷰는 그 도의 색을 그대로 이어받아
            //       어느 도를 파고든 건지 색으로 알 수 있게 한다.
            // 비활성: 전국뷰는 옅은 라벤더, 시도뷰는 회색(지원 대상이 아님)
            //
            // hover는 누를 수 있는 곳에만 준다. 다만 색은 갈라 쓴다 — 활성은 강조색으로
            // 확실히 뜨고, 회색이지만 누를 수 있는 곳은 한 톤만 어두워진다. 회색을 강조색으로
            // 물들이면 "지금 신청 가능"으로 읽힌다.
            const hot = hovered === it.key;
            const clickable = it.go != null;
            const fill = it.active
              ? hot
                ? COLOR_HOVER
                : nation
                  ? SIDO_COLOR[it.key] ?? COLOR_SIGUNGU
                  : sidoColor
              : nation
                ? hot && clickable
                  ? COLOR_INACTIVE_HOVER
                  : COLOR_INACTIVE
                : hot && clickable
                  ? COLOR_OFF_HOVER
                  : COLOR_OFF;
            return (
              <path
                key={it.key}
                d={toPath(it.geometry, project)}
                fill={fill}
                stroke={it.active ? "#fff" : COLOR_OFF_STROKE}
                strokeWidth={nation ? 0.8 : 0.6}
                className={clickable ? "cursor-pointer transition-colors" : ""}
                onMouseEnter={() => clickable && setHovered(it.key)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => goTo(it.go)}
              />
            );
          })}

        {/* 밀려난 배지 연결선 */}
        {badgePositions.map((b) => {
          const dist = Math.hypot(b.x - b.ox, b.y - b.oy);
          return dist > 10 ? (
            <line
              key={`line-${b.key}`}
              x1={b.x}
              y1={b.y}
              x2={b.ox}
              y2={b.oy}
              stroke={b.active ? sidoColor : COLOR_OFF_STROKE}
              strokeWidth={0.8 * unitPerPx}
            />
          ) : null;
        })}

        {/* 배지 (전국뷰=시도, 시도뷰=시군구) — 크기는 viewBox가 아니라 화면 기준으로 고정 */}
        {badgePositions.map((b) => {
          const note = badgeNote(b);
          return (
            <foreignObject
              key={`badge-${b.key}`}
              x={b.x - b.halfW}
              y={b.y - 0.75 * badgeFont}
              width={b.halfW * 2}
              height={1.5 * badgeFont}
              style={{ overflow: "visible" }}
            >
              {/* 알약은 글자 폭에 딱 맞게(inline-flex) 두고, 이 래퍼가 기준점에 정확히 가운데 맞춘다.
                  버튼을 foreignObject의 직접 자식으로 두면 폭이 추정치로 늘어나 좌우가 어긋난다. */}
              <div className="flex h-full w-full items-center justify-center">
                <button
                  type="button"
                  disabled={b.go == null}
                  aria-label={
                    note
                      ? `${spokenName(b)} (${note})`
                      : b.fullName !== b.name
                        ? spokenName(b)
                        : undefined
                  }
                  onClick={() => goTo(b.go)}
                  onMouseEnter={() => b.go != null && setHovered(b.key)}
                  onMouseLeave={() => setHovered(null)}
                  // 패딩·모서리를 em으로 두어 글자 크기 한 곳만 바꾸면 통째로 따라 커진다
                  style={
                    b.active
                      ? { fontSize: `${badgeFont}px` }
                      : {
                          fontSize: `${badgeFont}px`,
                          // 알약 대신 흰 테두리로 지도 색 위에서 글자를 읽히게 한다
                          textShadow: "0 0 0.25em #fff, 0 0 0.25em #fff, 0 0 0.25em #fff",
                        }
                  }
                  className={`inline-flex items-center gap-[0.15em] whitespace-nowrap font-bold transition-colors ${
                    b.active
                      ? `cursor-pointer rounded-full px-[0.65em] py-[0.2em] shadow-[0px_1px_4px_0px_rgba(0,0,0,0.18)] ${
                          hovered === b.key ? "bg-accent text-white" : "bg-white text-ink"
                        }`
                      : b.go != null
                        ? "cursor-pointer text-caption hover:text-ink"
                        : "cursor-default text-caption"
                  }`}
                >
                  {b.name}
                  {b.active && (
                    <span className={hovered === b.key ? "text-white/70" : "text-caption"}>›</span>
                  )}
                </button>
              </div>
            </foreignObject>
          );
        })}
      </svg>
      </div>
    </div>
  );
}
