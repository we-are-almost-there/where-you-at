import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection } from "geojson";
import { fetchOrNetworkError, HttpError } from "../../../lib/http";
import { buildProjection, geometryPath, labelPoint } from "../../support/koreaMapGeometry";
import { STAMP_SIDO, sidoCodeOf } from "../stampRegions";
import { formatDate } from "../format";
import type { SigunguStampStatus, Stamp } from "../types";
import { PRIMARY_BUTTON } from "../buttonStyles";
import ModalDialog from "../../../components/common/ModalDialog";

// SVG fill은 토큰 클래스를 못 써서 값으로 둔다. 방문 혜택 지도와 같은 색이다.
const COLOR_ACCENT = "#6C5CE7"; // --color-accent: 받은 시군구
const COLOR_ACCENT_HOVER = "#5F4FDC"; // --color-accent-strong
const COLOR_SIDO_DONE = "#C9B8F0"; // 받은 시군구가 있는 시도
const COLOR_SIDO_DONE_HOVER = "#B3A0EA";
const COLOR_SIDO = "#F1EFFC"; // --color-lavender: 아직 없는 시도
const COLOR_SIDO_HOVER = "#E0DBF7";
const COLOR_OFF = "#DFE3E8"; // 아직 없는 시군구
const COLOR_OFF_HOVER = "#CBD2DA";
const STROKE = "#FFFFFF";
const STROKE_SIDO = "#C5BFDE"; // --color-icon-muted: 연보라끼리 맞닿은 시도 경계가 보이게
const STROKE_SELECTED = "#2A2358"; // --color-ink: 고른 시군구 테두리 (받았는지와 따로 보이게 색 대신 테두리로)
const LABEL_PX = 12;
// 지도에 이름표를 다는 시도: 도·통합특별시·제주. 특별·광역시와 세종은 작아서 이름이 겹친다.
const LABELED_SIDO = new Set(["41", "51", "43", "44", "52", "12", "47", "48", "50"]);

interface MapFiles {
  sido: FeatureCollection;
  sigungu: FeatureCollection;
}

// 두 파일은 방문 혜택 지도와 같아 브라우저 캐시를 함께 쓴다. 다이얼로그를 다시 열 때 또 받지 않게 한 번만 부른다.
let mapFilesPromise: Promise<MapFiles> | null = null;
function loadMapFiles(): Promise<MapFiles> {
  const load = (url: string) =>
    fetchOrNetworkError(url).then((res) => {
      if (!res.ok) throw new Error(`지도 로드 실패 (${res.status})`);
      return res.json() as Promise<FeatureCollection>;
    });
  mapFilesPromise ??= Promise.all([load("/korea-sido.json"), load("/korea-all-regions.json")])
    .then(([sido, sigungu]) => ({ sido, sigungu }))
    .catch((error: unknown) => {
      mapFilesPromise = null; // 실패를 캐시하면 다시 시도해도 복구되지 않는다
      throw error;
    });
  return mapFilesPromise;
}

interface Region {
  code: string;
  name: string;
  feature: Feature;
}

export interface SelectedSigungu {
  code: string;
  name: string;
  sidoName: string;
}

interface Props {
  stamps: Stamp[];
  statuses?: SigunguStampStatus[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onStamp?: (code: string) => Promise<void>;
  onClose: () => void;
  /** 지도 선택 알림. 스탬프 저장은 별도 버튼에서 요청한다. */
  onSelectSigungu?: (region: SelectedSigungu) => void;
}

/**
 * 스탬프 지도. 방문 혜택 지도처럼 전국(시도) → 시도(시군구)로 들어간다.
 * 받은 시군구는 보라색, 받은 시군구가 있는 시도는 연보라로 칠한다.
 *
 * 지도는 마우스용이고, 같은 지역을 지도 아래 버튼 목록으로도 둔다. 키보드·화면낭독기로도 고를 수 있고,
 * 세종·광주 구처럼 지도에서 작아 누르기 어려운 곳도 쉽게 고를 수 있다. 목록에 마우스를 올리면 지도에서도 강조된다.
 */
export default function StampMapDialog({ stamps, statuses = [], loading = false, error = "", onRetry, onStamp, onClose, onSelectSigungu }: Props) {
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<{ code: string; message: string } | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const stampRegion = async (code: string) => {
    if (!onStamp || pending.current) return;
    pending.current = true;
    setBusy(true);
    setSaveError(null);
    try {
      await onStamp(code);
    } catch (err) {
      if (mounted.current) setSaveError({ code, message: err instanceof HttpError && err.status === 409
        ? "이 지역의 완주 기록이 아직 없어요. 완주 기록을 확인한 뒤 다시 시도해 주세요."
        : "스탬프를 찍지 못했어요. 연결을 확인하고 다시 시도해 주세요." });
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const [files, setFiles] = useState<MapFiles | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [sidoCode, setSidoCode] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedSigungu | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const firstRegionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadMapFiles().then(
      (loaded) => {
        if (!cancelled) setFiles(loaded);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  const stampByCode = useMemo(() => new Map(stamps.map((stamp) => [stamp.sigunguCode, stamp])), [stamps]);
  const doneSido = useMemo(() => new Set(stamps.map((stamp) => sidoCodeOf(stamp.sigunguCode))), [stamps]);

  const regions = useMemo((): Region[] => {
    if (!files) return [];
    if (sidoCode == null) {
      return files.sido.features.map((feature) => ({
        code: String(feature.properties?.sido_code),
        name: String(feature.properties?.sido_name),
        feature,
      }));
    }
    return files.sigungu.features
      .filter((feature) => sidoCodeOf(String(feature.properties?.sgg_code)) === sidoCode)
      .map((feature) => ({ code: String(feature.properties?.sgg_code), name: String(feature.properties?.name), feature }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [files, sidoCode]);

  const { project, viewW, viewH } = useMemo(() => buildProjection(regions.map((r) => r.feature.geometry)), [regions]);

  // 이름표 글자를 화면 기준 크기로 유지하려고 SVG가 실제로 그려진 크기를 잰다(방문 혜택 지도와 같은 방식).
  // 높이 제한(max-h)에 걸리면 SVG 상자 폭보다 작게 그려지므로, 폭과 높이 중 더 많이 줄어든 쪽을 기준으로 한다.
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgBox, setSvgBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      setSvgBox({ w: rect.width, h: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [files]);
  const unitPerPx = svgBox.w > 0 && svgBox.h > 0 ? Math.max(viewW / svgBox.w, viewH / svgBox.h) : 1;
  const fontSize = LABEL_PX * unitPerPx;

  const nation = sidoCode == null;
  const sidoName = STAMP_SIDO.find((sido) => sido.code === sidoCode)?.name ?? "";

  const enterSido = (code: string) => {
    setSidoCode(code);
    setHovered(null);
    setSelected(null);
  };
  const backToNation = () => {
    setSidoCode(null);
    setHovered(null);
    setSelected(null);
  };
  const pick = (region: Region) => {
    if (nation) {
      enterSido(region.code);
      return;
    }
    const next = { code: region.code, name: region.name, sidoName };
    setSelected(next);
    onSelectSigungu?.(next);
  };

  // 시도로 들어가거나 전국으로 돌아오면 목록 첫 버튼(또는 뒤로가기)으로 초점을 옮겨, 사라진 버튼에 초점이 남지 않게 한다.
  // 처음 열 때는 닫기 버튼에 둔다. 개발 모드(StrictMode)가 이펙트를 두 번 돌려도 바뀐 때만 옮기도록 이전 값과 비교한다.
  const prevSidoRef = useRef(sidoCode);
  useEffect(() => {
    if (prevSidoRef.current === sidoCode) return;
    prevSidoRef.current = sidoCode;
    (sidoCode == null ? firstRegionRef.current : backRef.current)?.focus();
  }, [sidoCode]);

  const fillOf = (region: Region) => {
    const hot = hovered === region.code;
    if (nation) {
      const done = doneSido.has(region.code);
      if (done) return hot ? COLOR_SIDO_DONE_HOVER : COLOR_SIDO_DONE;
      return hot ? COLOR_SIDO_HOVER : COLOR_SIDO;
    }
    if (stampByCode.has(region.code)) return hot ? COLOR_ACCENT_HOVER : COLOR_ACCENT;
    return hot ? COLOR_OFF_HOVER : COLOR_OFF;
  };

  const selectedStamp = selected ? stampByCode.get(selected.code) : undefined;

  return (
    <ModalDialog title="스탬프 지도" onClose={onClose} size="lg">
      {loading && <p role="status">스탬프를 불러오는 중…</p>}
      {error && <div><p role="alert">{error}</p><button type="button" onClick={onRetry}>다시 시도</button></div>}
      <div className="flex min-h-8 items-center gap-2">
        {!nation && (
          <button
            ref={backRef}
            type="button"
            onClick={backToNation}
            className="cursor-pointer text-[13px] text-caption transition-colors hover:text-ink"
          >
            <span aria-hidden="true">←</span> 전국으로
          </button>
        )}
        <p className="text-[15px] font-bold text-ink" aria-live="polite">
          {nation ? "시도를 고르세요" : `${sidoName} · 시군구를 고르세요`}
        </p>
      </div>

      {failed ? (
        <div className="py-16 text-center">
          <p role="alert" className="text-[14px] text-ink">
            지도를 불러오지 못했어요.
          </p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setRetryTick((tick) => tick + 1);
            }}
            className="mt-3 cursor-pointer text-[14px] font-bold text-accent hover:opacity-70"
          >
            다시 시도
          </button>
        </div>
      ) : !files ? (
        <p role="status" className="py-16 text-center text-[14px] text-caption">
          지도를 불러오는 중…
        </p>
      ) : (
        <>
          <div className="mx-auto mt-2 w-full max-w-[520px] rounded-[14px] border border-divider-soft p-2">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${viewW.toFixed(1)} ${viewH.toFixed(1)}`}
              className="h-auto max-h-[46dvh] w-full"
              aria-hidden="true"
            >
              {project &&
                regions.map((region) => (
                  <path
                    key={region.code}
                    d={geometryPath(region.feature.geometry, project)}
                    fill={fillOf(region)}
                    stroke={selected?.code === region.code ? STROKE_SELECTED : nation ? STROKE_SIDO : STROKE}
                    strokeWidth={selected?.code === region.code ? 2.5 : nation ? 0.8 : 0.6}
                    className="cursor-pointer transition-colors"
                    onMouseEnter={() => setHovered(region.code)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => pick(region)}
                  >
                    <title>{region.name}</title>
                  </path>
                ))}
              {/* 이름표는 전국 지도의 도(道)와 제주에만 단다. 서울·인천·세종·대전처럼 작은 시는 이름이 서로 겹치고,
                  시군구는 30개 가까이 돼 겹치므로 아래 목록과 마우스 올림(title)으로 대신한다. */}
              {project &&
                nation &&
                regions.filter((region) => LABELED_SIDO.has(region.code)).map((region) => {
                  const [x, y] = labelPoint(region.feature.geometry, project);
                  return (
                    <text
                      key={`label-${region.code}`}
                      x={x}
                      y={y}
                      fontSize={fontSize}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="pointer-events-none fill-ink font-bold"
                      style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: fontSize * 0.3 }}
                    >
                      {STAMP_SIDO.find((sido) => sido.code === region.code)?.short ?? region.name}
                    </text>
                  );
                })}
            </svg>
          </div>

          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={nation ? "시도 목록" : `${sidoName} 시군구 목록`}>
            {regions.map((region, index) => {
              const done = nation ? doneSido.has(region.code) : stampByCode.has(region.code);
              const current = selected?.code === region.code;
              return (
                <li key={region.code}>
                  <button
                    ref={index === 0 ? firstRegionRef : undefined}
                    type="button"
                    onClick={() => pick(region)}
                    onMouseEnter={() => setHovered(region.code)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(region.code)}
                    onBlur={() => setHovered(null)}
                    aria-pressed={nation ? undefined : current}
                    className={`h-8 cursor-pointer rounded-full px-3 text-[13px] font-medium transition-colors ${
                      current
                        ? "bg-accent text-white"
                        : done
                          ? "bg-lavender text-accent-strong hover:bg-control-hover"
                          : "border border-control-border text-ink hover:bg-control-hover"
                    }`}
                  >
                    {nation ? (STAMP_SIDO.find((sido) => sido.code === region.code)?.short ?? region.name) : region.name}
                    {/* 앞 공백은 span 밖에 둔다. 안에 두면 이름 계산에서 잘려 "강원(스탬프 받음)"처럼 붙는다. */}
                    {done && (
                      <>
                        {" "}
                        <span className="sr-only">(스탬프 받음)</span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {!nation && (
            <div className="mt-4 rounded-[10px] border border-divider-soft px-4 py-3 text-[14px]" aria-live="polite">
              {selected ? (
                <p className="text-ink">
                  <span className="font-bold">{selected.name}</span>
                  <span className="ml-2 text-caption">
                    {selectedStamp ? `${formatDate(selectedStamp.stampedAt)}에 스탬프를 찍었어요.`
                      : loading || error ? "스탬프 상태를 확인해 주세요."
                        : statuses.some((item) => item.sigunguCode === selected.code && item.status === "AVAILABLE")
                          ? "완주한 지역이에요. 스탬프를 찍어 보세요."
                          : "아직 완주하지 않아 스탬프를 찍을 수 없어요."}
                  </span>
                </p>
              ) : (
                <p className="text-caption">지도나 목록에서 시군구를 고르면 스탬프 현황을 보여 드려요.</p>
              )}
              {selected && !loading && !error && !selectedStamp && onStamp && statuses.some((item) => item.sigunguCode === selected.code && item.status === "AVAILABLE") && (
                <button type="button" className={`${PRIMARY_BUTTON} mt-3 disabled:opacity-50`} disabled={busy}
                  onClick={() => void stampRegion(selected.code)}>{busy ? "찍는 중…" : "스탬프 찍기"}</button>
              )}
              {selected && saveError?.code === selected.code && <p role="alert" className="mt-2 text-danger">{saveError.message}</p>}
            </div>
          )}
        </>
      )}
    </ModalDialog>
  );
}
