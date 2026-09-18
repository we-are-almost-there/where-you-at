import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import { useSearchParams } from "react-router";
import { buildRegionIndex, type RegionEntry, type RegionIndex } from "../regionMatch";
import { VIEW_BASE, buildProjection, geometryPath, labelPoint } from "../koreaMapGeometry";
import { fetchActiveRegionCodes } from "../supportApi";
import { toUserError, type UserError } from "../../../components/error/userError";
import { fetchOrNetworkError } from "../../../lib/http";
import { SupportErrorText } from "./SupportErrorText";

const COLOR_HOVER = "#6C5CE7"; // --color-accent (SVG fill이라 토큰 클래스 대신 값으로)
const COLOR_INACTIVE = "#F1EFFC"; // --color-lavender (전국뷰의 미해당 시도)
const COLOR_INACTIVE_HOVER = "#E0DBF7"; // 위와 같되 누를 수 있을 때의 hover (한 톤 어둡게)
const COLOR_SIGUNGU = "#C9B8F0"; // 시도 색을 못 찾았을 때의 폴백 채움
const COLOR_OFF = "#DFE3E8"; // 시도뷰의 미해당 시군구 (회색)
const COLOR_OFF_HOVER = "#CBD2DA"; // 회색이지만 누를 수 있는 지역의 hover (한 톤 어둡게)
const COLOR_OFF_STROKE = "#CFD5DC"; // 회색 지역끼리의 경계선

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
// 전국뷰는 대구처럼 다른 도 안에 들어앉은 시가 모도(경북) 라벨과 붙지 않도록 넉넉히 잡는다.
// 시도뷰는 라벨이 20개 넘게 들어와서 같은 값을 쓰면 세로로 3~4줄밖에 못 들어가 겹친다.
// 알약 높이가 약 1.5em이므로 2.4em이면 서로 닿지 않으면서 촘촘히 앉을 수 있다.
const BADGE_H_EM_NATION = 5.5;
const BADGE_H_EM_SIDO = 2.4;
// 배지 폭은 이름 길이로 각자 계산한다. 전부 같은 폭으로 잡으면 '고성군' 같은 짧은 이름이
// '전남광주통합특별시' 기준으로 밀려나 필요 이상으로 흩어진다.
// 미해당 지역은 알약 없이 글자만 그리므로 좌우 패딩(약 1.3em)만큼 폭이 준다.
const badgeWidthEm = (name: string, active: boolean) => name.length + (active ? 1.8 : 0.4);

/** 지도에 그릴 한 조각. 전국뷰는 시도, 시도뷰는 시군구가 들어온다. */
type MapItem = {
  key: string;
  geometry: Geometry;
  name: string;
  /** 색칠 여부 — 지금 신청 가능한 제도가 있는가 */
  active: boolean;
  /**
   * 눌러서 들어갈 수 있는가. 지원 대상 지역이거나, 색칠된 곳이다.
   * active와 기준은 다르지만 포함 관계다 — 색칠된 곳은 반드시 누를 수 있다.
   */
  clickable: boolean;
  /** 클릭 시 넘길 코드. 누를 수 없으면 null */
  target: string | null;
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

  // 클릭 대상. 색칠과 기준이 다르다.
  //   색   = "지금 신청 가능한 제도가 있는가" — 조회 결과라 시간에 따라 변한다
  //   클릭 = "들어가서 볼 게 있는가"        — 정적 목록이라 항상 안다
  //
  // 다만 이 변수가 최종 클릭 대상은 아니다. 아래 viewItems에서 조회 결과(active)를
  // 합친 것이 최종이다 — 색칠된 곳이 이 목록 밖일 수 있고, 그때도 눌려야 한다.
  // 회색이어도 패널에는 보여줄 게 있다(제도 없음 안내 + 그 지역 코스 링크). 클릭까지
  // 색에 묶으면 조회가 끝나기 전에는 지도 전체가 눌리지 않아, 정적 파일만 받으면
  // 바로 쓸 수 있던 지도가 API 왕복을 기다리는 동안 죽어 있다.
  const clickableCodes = mapData?.supportRegions ?? EMPTY_CODES;

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
  // 드릴다운은 색과 무관하게 열어 둔다. 그 도에 지원 대상 시군구가 하나라도 있으면
  // 들어갈 이유가 있고, 조회가 끝나기 전에도 그건 이미 안다.
  const clickableSidoCodes = useMemo(
    () => sidoCodesOf(regions, clickableCodes),
    [regions, clickableCodes],
  );

  const viewItems = useMemo((): MapItem[] => {
    if (selectedSido == null) {
      return (sido?.features ?? []).map((f) => {
        const code = String(f.properties?.sido_code);
        return {
          key: code,
          geometry: f.geometry,
          name: String(f.properties?.sido_name),
          active: activeSidoCodes.has(code),
          // 시군구와 같은 이유로 active를 합친다 (아래 주석 참고).
          // 색칠된 시도로 드릴다운조차 못 하면 그 안의 지역에 닿을 길이 없다.
          clickable: clickableSidoCodes.has(code) || activeSidoCodes.has(code),
          target: code,
        };
      });
    }
    return (regions ?? [])
      .filter((r) => r.sidoCode === selectedSido)
      .map((r) => {
        const active = r.regionCode != null && supportCodes.has(r.regionCode);
        // 색칠된 곳은 반드시 누를 수 있어야 한다. clickableCodes는 인구감소지역
        // 목록이고 API는 거기 매이지 않으므로, 비인구감소지역에 제도가 하나 걸리면
        // 색만 칠하고 클릭은 막히는 지역이 생긴다. active를 먼저 합친다.
        const clickable = active || (r.regionCode != null && clickableCodes.has(r.regionCode));
        return {
          key: `${selectedSido}-${r.feature.properties?.sgg_code ?? r.name}`,
          geometry: r.feature.geometry,
          name: r.name,
          active,
          clickable,
          target: clickable ? r.regionCode : null,
        };
      });
  }, [selectedSido, sido, regions, activeSidoCodes, clickableSidoCodes, supportCodes, clickableCodes]);

  // 현재 뷰 대상의 경위도 범위에 맞춘 투영 (전국이든 시도든). 계산은 koreaMapGeometry 참고.
  const { project, viewW, viewH } = useMemo(
    () => buildProjection(viewItems.map((it) => it.geometry)),
    [viewItems],
  );

  // viewBox 단위 / CSS px. 모바일처럼 지도가 작게 그려질수록 1보다 커진다.
  const unitPerPx = viewW / svgPxWidth;
  const badgeFont = BADGE_FONT_PX * unitPerPx;

  // 배지 위치 (중심 좌표).
  // 전국뷰는 지원지역이 있는 시도만, 시도뷰는 미해당 시군구까지 라벨을 단다.
  // 다만 좁은 화면에서는 전남처럼 시군구가 많은 도에서 27개가 겹치므로 회색 라벨은 접는다
  // — 회색 도형은 그대로 남아 도의 윤곽은 유지된다.
  const badges = useMemo(() => {
    if (!project) return [];
    const src = selectedSido == null ? viewItems.filter((it) => it.clickable) : viewItems;
    return src.map((it) => {
      // 가장 큰 링의 중심 (작은 섬 말고 본체에 배지)
      const [cx, cy] = labelPoint(it.geometry, project);
      return {
        key: it.key, name: it.name, active: it.active, clickable: it.clickable,
        target: it.target, cx, cy,
      };
    });
  }, [selectedSido, viewItems, project]);

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

  if (error) return <SupportErrorText error={error} className="py-16" />;
  if (!sido || !regions)
    return (
      <p role="status" className="py-16 text-center text-[14px] text-caption">
        지도를 불러오는 중…
      </p>
    );

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
            const fill = it.active
              ? hot
                ? COLOR_HOVER
                : nation
                  ? SIDO_COLOR[it.target ?? ""] ?? COLOR_SIGUNGU
                  : sidoColor
              : nation
                ? hot && it.clickable
                  ? COLOR_INACTIVE_HOVER
                  : COLOR_INACTIVE
                : hot && it.clickable
                  ? COLOR_OFF_HOVER
                  : COLOR_OFF;
            return (
              <path
                key={it.key}
                d={geometryPath(it.geometry, project)}
                fill={fill}
                stroke={it.active ? "#fff" : COLOR_OFF_STROKE}
                strokeWidth={nation ? 0.8 : 0.6}
                className={it.clickable ? "cursor-pointer transition-colors" : ""}
                onMouseEnter={() => it.clickable && setHovered(it.key)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => {
                  if (!it.clickable || !it.target) return;
                  if (nation) setSelectedSido(it.target);
                  else setSearchParams({ region: it.target });
                }}
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
        {badgePositions.map((b) => (
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
                disabled={!b.clickable}
                // 알약(활성)은 이름만으로 뜻이 통한다. 나머지는 왜 다른지 읽어 줘야 한다 —
                // 회색이어도 눌리는 곳과 아예 대상이 아닌 곳은 다른 이야기다.
                aria-label={
                  b.active
                    ? undefined
                    : !b.clickable
                      ? `${b.name} (지원 대상 아님)`
                      : active.status === "ready"
                        ? `${b.name} (진행 중인 제도 없음)`
                        // 조회가 끝나기 전에는 제도가 없는지 모른다. 화면에는 '확인 중'
                        // 칩이 떠 있지만 배지만 듣는 사람에게는 그 문맥이 없으므로,
                        // 아직 모르는 사실을 없다고 단정하지 않는다.
                        : `${b.name} (신청 정보 확인 중)`
                }
                onClick={() => {
                  if (!b.clickable || !b.target) return;
                  if (selectedSido == null) setSelectedSido(b.target);
                  else setSearchParams({ region: b.target });
                }}
                onMouseEnter={() => b.clickable && setHovered(b.key)}
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
                    : b.clickable
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
        ))}
      </svg>
      </div>
    </div>
  );
}