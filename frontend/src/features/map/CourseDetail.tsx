import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { CircleAlert } from "lucide-react";
import { KakaoMap } from "./KakaoMap";
import { ErrorNotice, CONNECTION_ERROR_TITLE, CONNECTION_ERROR_DESC } from "./components/ErrorNotice";
import { getCourseDetail, getCourseGpx } from "./coursesApi";
import type { CourseDetail as CourseDetailData, LatLng, RouteDetail, RouteType } from "./types";
import { Nearby } from "../nearby";
import type { NearbyHandle } from "../nearby";
import type { NearbySpot } from "../nearby/types";
import { parseRouteTypeParam, setRouteTypeParam } from "./courseUrlState";
import { useCourseTracking } from "./useCourseTracking";
import { WAKE_LOCK_FAILURE_MESSAGE } from "./useWakeLock";
import { advanceProgress, distanceToCourse, nearestPointOnCourse, type Direction } from "./courseProgress";
import { announce, primeSpeech } from "./speech";
import { useEndpointAddresses } from "./endpointAddress";
import { DirectionSelector } from "./components/DirectionSelector";
import { TrackingStats } from "./components/TrackingStats";
import SidebarDrawer from "../../components/layout/SidebarDrawer";

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `약 ${h}시간 ${m}분`;
  if (h) return `약 ${h}시간`;
  return `약 ${m}분`;
}

const MODE_ICON: Record<RouteType, string> = { 도보: "🚶", 자전거: "🚲" };

// 이보다 멀리 떨어져 있으면 따라가기를 시작해도 진행률이 의미가 없다.
// 주차장·역에서 접근하는 경우를 감안한 값이라 실외 테스트 후 조정이 필요하다.
const MAX_START_DISTANCE_M = 1000;

// 주행 중 코스 이탈 판정(선분 수선거리 기준). 진입/복귀 임계값을 벌린 히스테리시스로
// GPS 튐에 배너·음성이 깜빡이는 걸 막는다. 실외 테스트 후 조정이 필요한 값이다.
const OFF_COURSE_ENTER_M = 40; // 이보다 멀어지면 이탈로 표시
const OFF_COURSE_EXIT_M = 15; // 이보다 가까워지면 복귀


function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}

// 외부(두루누비) 설명의 <br> 태그를 실제 줄바꿈으로 안전하게 렌더한다.
// dangerouslySetInnerHTML을 쓰지 않으므로 HTML/스크립트 주입 위험이 없다.
function withLineBreaks(text: string) {
  return text.split(/<br\s*\/?>/i).map((seg, i, arr) => (
    <span key={i}>
      {seg}
      {i < arr.length - 1 && <br />}
    </span>
  ));
}

type InfoTab = "course" | "nearby";

// 도보/자전거 선택 카드 (디자인 ModeSelector)
function ModeCard({
  route,
  active,
  disabled,
  onSelect,
}: {
  route: RouteDetail;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={active}
      className={`@container flex flex-1 cursor-pointer flex-col gap-1.5 rounded-[14px] p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-2 border-accent bg-lavender text-accent shadow-[0px_4px_14px_0px_rgba(0,0,0,0.12)]"
          : "border-[1.5px] border-divider bg-white text-caption"
      }`}
    >
      <span className="text-[14px] font-bold">
        {MODE_ICON[route.route_type]} {route.route_type}
      </span>
      {/* fold처럼 좁은 폭에서 '분'이 줄바꿈되지 않도록 nowrap + 카드 폭에 반응하는 유체 크기 */}
      <span className="whitespace-nowrap text-[clamp(14px,14cqi,22px)] font-bold leading-none">
        {formatDuration(route.estimated_time)}
      </span>
      <span className={`text-[14px] ${active ? "text-ink" : ""}`}>
        {route.distance.toFixed(1)}km
        {route.route_type === "도보" && route.difficulty && ` · ${route.difficulty}`}
      </span>
    </button>
  );
}

export function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const courseId = Number(id);
  
  const [detail, setDetail] = useState<CourseDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const routeType = parseRouteTypeParam(searchParams);
  const [infoTab, setInfoTab] = useState<InfoTab>("course");
  const [descExpanded, setDescExpanded] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);
  const [descOverflow, setDescOverflow] = useState(false);
  // 모바일 바텀시트 펼침/접힘. 접힘으로 진입한다 — 접힘(51%)이 제목·진행 방향·탭까지
  // 다 보여주는 기본 화면이고, 펼침(71%)은 코스 설명을 읽으러 갈 때 쓴다.
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0); // 바텀시트 실측 높이(지도 하단이 가려지는 양)
  const [isNarrow, setIsNarrow] = useState(false); // md 미만 — 시트가 지도를 덮는 구간
  const [retryTick, setRetryTick] = useState(0); // '다시 시도' 트리거
  const validId = Number.isFinite(courseId);
  const {
    currentLocation,
    isTracking,
    error: trackingError,
    wakeLockFailed,
    startTracking,
    stopTracking,
  } = useCourseTracking();
  const [waypoints, setWaypoints] = useState<LatLng[]>([]);
  const [startAddress, endAddress] = useEndpointAddresses(waypoints);
  const [direction, setDirection] = useState<Direction>("forward"); // 기본 정방향, 토글로 역방향
  const [progress, setProgress] = useState(0); // 0~100, 최고 진행률 유지
  const [now, setNow] = useState(0); // 예상 종료 시각 계산의 기준 시각(추적 중에만 갱신)
  const [startChecked, setStartChecked] = useState(false); // 세션당 한 번만 시작 거리 판정
  const [tooFarMeters, setTooFarMeters] = useState<number | null>(null); // null이 아니면 안내 팝업
  const [offCourseMeters, setOffCourseMeters] = useState<number | null>(null); // null이 아니면 이탈 중(배너·유도선)
  const [offCourseGuidePoint, setOffCourseGuidePoint] = useState<LatLng | null>(null); // 유도선이 향할 코스 위 지점
  const wasOffCourseRef = useRef(false); // 이탈 진입 순간(아님→이탈)에만 음성이 나가도록 직전 상태 보관

  const nearbyRef = useRef<NearbyHandle>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [nearbySpots, setNearbySpots] = useState<NearbySpot[]>([]);
  const [selectedNearbySpotId, setSelectedNearbySpotId] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  useEffect(() => {
    if (!validId) return; // 잘못된 id는 아래 렌더에서 파생 처리
    let cancelled = false;
    getCourseDetail(courseId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "코스를 불러오지 못했어요"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [courseId, validId, retryTick]);

  // GPX는 지도 폴리라인과 진행률 계산이 함께 쓰므로 여기서 한 번만 받아 KakaoMap으로 내려준다.
  useEffect(() => {
    if (!validId) return;
    let cancelled = false;
    getCourseGpx(courseId, routeType)
      .then((wps) => !cancelled && setWaypoints(wps))
      .catch((err) => {
        if (cancelled) return;
        console.error("[CourseDetail] gpx fetch error:", err);
        setWaypoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, validId, routeType]);

  // 새 위치가 들어오면 진행률을 전진시킨다(최고 진행률 유지).
  // effect가 아니라 렌더 중 조정 — 위치 갱신은 외부 이벤트라 effect로 되받으면 렌더가 한 번 더 돈다.
  // 진행률 초기화는 추적 시작·방향 전환·주행 방식 변경 시점에 각 핸들러가 담당한다.
  const [lastLocation, setLastLocation] = useState<LatLng | null>(null);
  if (currentLocation !== lastLocation) {
    setLastLocation(currentLocation);
    if (isTracking && currentLocation && waypoints.length > 0) {
      if (!startChecked) {
        // 첫 위치가 잡힌 순간에만 "코스에서 너무 멂"을 판정한다.
        // 걷는 도중의 일시적 이탈까지 막으면 오히려 방해가 된다.
        setStartChecked(true);
        const gap = distanceToCourse(waypoints, currentLocation);
        if (gap > MAX_START_DISTANCE_M) setTooFarMeters(gap);
        else setProgress((prev) => advanceProgress(prev, waypoints, currentLocation, direction));
      } else if (tooFarMeters == null) {
        setProgress((prev) => advanceProgress(prev, waypoints, currentLocation, direction));
        // 주행 중 이탈 감지 — 히스테리시스: 이탈 중이면 EXIT까지 유지, 아니면 ENTER를 넘어야 이탈.
        const { point, distance } = nearestPointOnCourse(waypoints, currentLocation);
        const off = offCourseMeters != null ? distance >= OFF_COURSE_EXIT_M : distance > OFF_COURSE_ENTER_M;
        if (off) {
          setOffCourseMeters(distance);
          setOffCourseGuidePoint(point);
        } else {
          if (offCourseMeters != null) setOffCourseMeters(null);
          if (offCourseGuidePoint != null) setOffCourseGuidePoint(null);
        }
      }
    }
  }

  // 추적 중에는 시계가 흘러야 예상 종료 시각이 현재 시각을 따라간다.
  useEffect(() => {
    if (!isTracking) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isTracking]);

  // 이탈 진입(아님→이탈)의 순간에만 1회 음성 안내. 계속 이탈 중이면 반복하지 않는다.
  const isOffCourse = offCourseMeters != null;
  useEffect(() => {
    if (isOffCourse && !wasOffCourseRef.current) announce("코스에서 벗어났어요");
    wasOffCourseRef.current = isOffCourse;
  }, [isOffCourse]);

  // URL로 요청한 주행 방식이 없는 코스라면 보유한 첫 경로로 URL을 교정한다.
  useEffect(() => {
    if (!detail || detail.routes.some((route) => route.route_type === routeType) || !detail.routes[0]) return;
    const nextParams = new URLSearchParams(searchParams);
    setRouteTypeParam(nextParams, detail.routes[0].route_type);
    setSearchParams(nextParams, { replace: true });
  }, [detail, routeType, searchParams, setSearchParams]);

  const changeRouteType = (next: RouteType) => {
    const nextParams = new URLSearchParams(searchParams);
    setRouteTypeParam(nextParams, next);
    // replace: 히스토리에 쌓으면 뒤로가기가 목록이 아니라 이전 주행 방식으로 돌아가고,
    // 그때 화면은 그대로라 추적이 살아 있는 채 코스만 바뀐다.
    setSearchParams(nextParams, { replace: true });
    setProgress(0); // 코스 자체가 달라지므로 초기화
  };

  // 새 추적 세션은 항상 0%에서 시작한다(이전 세션이 어떻게 끝났든).
  // 이탈 상태도 여기서만 지운다 — 추적이 멈출 때 지울 필요는 없다.
  // 배너·유도선은 showOffCourse가 isTracking을 요구하므로 값이 남아 있어도 그려지지 않는다.
  const handleStartTracking = () => {
    setProgress(0);
    setNow(Date.now());
    setStartChecked(false);
    setTooFarMeters(null);
    setOffCourseMeters(null);
    setOffCourseGuidePoint(null);
    wasOffCourseRef.current = false;
    primeSpeech(); // 버튼 탭(사용자 제스처) 시점에 iOS 음성 잠금 해제
    startTracking();
  };

  // 안내를 닫을 때 추적을 정리한다(clearWatch는 부수효과라 렌더 중엔 못 부른다).
  const dismissTooFar = () => {
    setTooFarMeters(null);
    stopTracking();
  };

  // 방향 선택은 추적 시작 전에만 노출되고, 시작 시 진행률이 어차피 0으로 초기화된다.
  const toggleDirection = () => setDirection((d) => (d === "forward" ? "reverse" : "forward"));

  const retry = () => {
    setLoading(true);
    setError(null);
    setRetryTick((t) => t + 1);
  };

  // 설명이 3줄(line-clamp-3)을 실제로 넘칠 때만 '더보기'를 노출한다.
  // 글자 수 추정은 폭, 줄바꿈을 반영 못 해 3줄에 다 들어가도 버튼이 뜨는 문제가 있었다.
  // 접힘 상태에서만 측정 가능(펼치면 clamp가 풀림)하므로 접힘일 때 갱신하고, 폭 변화 시 재측정한다.
  useEffect(() => {
    const el = descRef.current;
    if (!el || descExpanded) return;
    const measure = () => setDescOverflow(el.scrollHeight > el.clientHeight + 1);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [detail?.description, infoTab, descExpanded]);

  // md 미만에서만 바텀시트가 지도를 덮는다(그 구간에서만 지도를 시트 높이만큼 올린다).
  //
  // Tailwind md:의 여집합으로 판정한다. "(max-width: 767px)"를 쓰면 폭이 767과 768 사이의
  // 소수점(디스플레이 배율·브라우저 줌으로 흔히 생긴다)일 때 이 쿼리도 false, md:도 미적용이라
  // 시트는 지도를 덮는데 isNarrow만 false가 된다. 그러면 bottomInset이 0이 되어 시트 높이를
  // 무시한 채 fit해 코스 아래쪽이 시트에 가려진다.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsNarrow(!mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // 지도 하단이 가려지는 양 = 바텀시트의 실측 높이. 접힘/펼침·추적 전환에 따라 높이가 바뀌므로
  // 비율 추정 대신 ResizeObserver로 실제 높이를 추적해 코스 fit·현위치 이동을 정확히 맞춘다.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const measure = () => setSheetHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 디자인 순서: 도보 먼저, 자전거 다음 (API는 알파벳순 bicycle→trail로 내려줌)
  const orderedRoutes = detail
    ? [...detail.routes].sort((a, b) => (a.route_type === "도보" ? -1 : 1) - (b.route_type === "도보" ? -1 : 1))
    : [];
  const activeRoute = detail?.routes.find((r) => r.route_type === routeType) ?? detail?.routes[0];

  // 남은 거리·예상 종료 시각은 코스의 공식 거리/소요시간을 진행률로 안분해 추정한다.
  // (실제 이동 속도 기반이 아니라 GPS가 튀어도 값이 출렁이지 않는다)
  //
  // 진행률은 GPX 누적거리 기준인데 여기서 곱하는 건 API 공식 거리다. 둘은 조금 다르지만
  // (1번 코스 기준 GPX 18.70km vs 공식 19.00km, 1.6%) 의도적으로 공식 거리를 쓴다.
  // GPX 총합을 쓰면 0%일 때 "18.7km 남음"으로 떠서 코스 카드의 "19.0km"와 어긋나 보인다.
  // 공식 거리에 비율을 곱하면 0%=19.0km, 100%=0km로 눈에 보이는 값끼리 항상 맞는다.
  // 코스에서 너무 멀어 안내가 뜬 상태면 진행률(0%)을 띄우지 않는다 — 시작하지 못한 것이라서.
  const showStats =
    isTracking && currentLocation != null && waypoints.length > 0 && tooFarMeters == null;
  // 이탈 배너·유도선은 실제 따라가는 중이고 이탈 판정이 선 경우에만.
  const showOffCourse = showStats && offCourseMeters != null;
  const remainingRatio = 1 - progress / 100;
  const remainingKm = (activeRoute?.distance ?? 0) * remainingRatio;
  const eta = new Date(
    now + Math.round((activeRoute?.estimated_time ?? 0) * remainingRatio) * 60_000,
    // 좁은 폭(폴드)에서 "오후 04:12"가 두 줄로 깨지므로 24시간 표기로 고정
  ).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

  // 모바일에선 바텀시트가 지도 하단을 가리므로, 실측한 시트 높이만큼 코스를 위로 올려 fit.
  // 데스크톱은 지도가 시트와 겹치지 않아 0.
  const mapBottomInset = isNarrow ? Math.round(sheetHeight) : 0;

  return (
    // 모바일: 지도 풀블리드 + 하단 바텀시트 / md+: 좌 패널 + 우 지도
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-white md:flex-row">
      {/* 코스에서 너무 멀 때 안내 (지도·시트 위에 뜨는 팝업) */}
      {/* isTracking을 함께 보는 이유: 종료 버튼·주변 탭 이동으로 추적이 멈추면 안내도 닫혀야 한다 */}
      {tooFarMeters != null && isTracking && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="코스에서 너무 멀어요"
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 px-6"
        >
          <div className="w-full max-w-sm rounded-[18px] bg-white px-5 py-6 text-center shadow-[0px_8px_24px_0px_rgba(0,0,0,0.2)]">
            {/* break-keep: 한글은 기본값이 글자 단위로 끊겨 "있어요"가 "있/어요"처럼 갈라진다 */}
            <p className="break-keep text-[17px] font-bold text-ink">코스에서 조금 먼 것 같아요</p>
            <p className="mt-2 break-keep text-[14px] leading-relaxed text-caption">
              지금 계신 곳이 코스에서 약 {formatDistance(tooFarMeters)} 떨어져 있어요. 코스 근처에서
              다시 시작해 주시겠어요?
            </p>
            <button
              type="button"
              onClick={dismissTooFar}
              className="mt-5 h-12 w-full cursor-pointer rounded-[14px] bg-accent text-[15px] font-bold text-lavender"
            >
              알겠어요
            </button>
          </div>
        </div>
      )}

      {/* 지도 (z-0으로 stacking context를 가둬 Kakao 내부 레이어가 시트를 덮지 않게 함) */}
      <div className="absolute inset-0 z-0 md:relative md:order-2 md:h-full md:min-w-0 md:flex-1">
        {/* 코스 이탈 배너 — 메뉴 버튼(top 16 + 높이 44) 아래, 가로 중앙. 조작 UI를 가리지 않는 비모달 안내. */}
        {showOffCourse && (
          <div
            role="status"
            className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2"
            style={{ top: "calc(env(safe-area-inset-top) + 68px)" }}
          >
            <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-[#FF4D4F] shadow-[0_2px_10px_rgba(0,0,0,0.22)]">
              <CircleAlert size={16} aria-hidden className="shrink-0" />
              코스에서 약 {formatDistance(offCourseMeters!)} 벗어났어요
            </div>
          </div>
        )}
        <KakaoMap
          waypoints={waypoints}
          direction={direction}
          bottomInset={mapBottomInset}
          currentLocation={currentLocation}
          followCurrentLocation={isTracking}
          offCourseGuidePoint={showOffCourse ? offCourseGuidePoint : null}
          showLocateButton={infoTab === "course"}
          nearbySpots={infoTab === "nearby" ? nearbySpots : []}
          selectedSpotId={infoTab === "nearby" ? selectedNearbySpotId : null}
          onSpotMarkerClick={(id) => {
            nearbyRef.current?.selectSpotById(id);
          }}
          onMenuClick={() => setIsSidebarOpen(true)}
        />
      </div>

      {/* 패널 (모바일=바텀시트, md+=좌측 컬럼)
        md:relative 유지 필요: 주변 정보 탭 안의 SpotDetailSheet(상세 시트)가 absolute로 위치를 잡는데,
        이 section이 relative여야 시트가 이 패널 안에서만 뜸.
        static으로 바꾸면 시트가 기준을 잃고 지도까지 덮는 전체화면으로 퍼져버림. */}
      <section
        ref={panelRef}
        className={`absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-[24px] bg-white shadow-[0px_-6px_14px_0px_rgba(0,0,0,0.16)] transition-[max-height] duration-300 md:relative md:order-1 md:h-full md:max-h-none md:basis-[46%] md:rounded-none md:shadow-none lg:basis-[44%] ${
          isTracking ? "max-h-[60%]" : sheetExpanded ? "max-h-[71%]" : "max-h-[51%]"
        }`}
      >
        {/* 바텀시트 핸들 (모바일 전용) — 탭하면 시트를 접어 지도(전체 코스)를 넓게 본다 */}
        <button
          type="button"
          onClick={() => setSheetExpanded((v) => !v)}
          aria-label={sheetExpanded ? "코스 정보 접기" : "코스 정보 펼치기"}
          className={`shrink-0 cursor-pointer pt-2.5 pb-1 md:hidden ${isTracking ? "hidden" : ""}`}
        >
          <span className="mx-auto block h-[5px] w-11 rounded-full bg-divider" />
        </button>

        {loading && validId ? (
          <p className="py-16 text-center text-[14px] text-caption">코스를 불러오는 중…</p>
        ) : !validId ? (
          <ErrorNotice
            title="잘못된 코스예요"
            description="존재하지 않는 코스 주소예요."
            onBack={() => navigate(-1)}
          />
        ) : error ? (
          // 조회 실패(연결/서버) — 재시도 + 목록으로
          <ErrorNotice
            title={CONNECTION_ERROR_TITLE}
            description={CONNECTION_ERROR_DESC}
            onRetry={retry}
            onBack={() => navigate(-1)}
          />
        ) : !detail ? (
          <ErrorNotice title="코스를 찾을 수 없어요" onBack={() => navigate(-1)} />
        ) : (
          <>
            {/* 스크롤 영역 (모바일은 콘텐츠 높이에 맞춰 시트가 줄어 따라가기 버튼과 붙는다)
              추적 중에는 모바일에서만 숨겨 지도를 넓게 쓴다. 데스크톱은 지도와 나란히 놓여
              가릴 일이 없고, 숨기면 좌측 컬럼이 텅 비므로 그대로 둔다. */}
            <div
              className={`min-h-0 overflow-y-auto px-5 pb-6 pt-3 md:flex-1 ${
                isTracking ? "hidden md:block" : ""
              }`}
            >
              {/* 뒤로 + 제목 + 주소 */}
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="뒤로"
                className="cursor-pointer text-[20px] leading-none text-ink"
              >
                ←
              </button>
              <h1 className="mt-2 font-bold text-ink text-[20px]">{detail.title}</h1>

              {/* 출발/도착 주소를 보여주는 유일한 자리라 탭과 무관하게 항상 띄운다.
                추적 중엔 방향을 바꿀 수 없게(진행률 계산과 꼬이므로) 숨긴다 —
                모바일에서 이 블록을 포함한 정보 영역 전체가 접히는 것과도 맞아떨어진다. */}
              {!isTracking && (
                <div className="mt-3">
                  <DirectionSelector
                    start={startAddress}
                    end={endAddress}
                    direction={direction}
                    onToggle={toggleDirection}
                  />
                </div>
              )}

              {/* 코스 정보 / 주변 정보 토글 */}
              <div
                role="tablist"
                className="mt-4 flex gap-1 rounded-2xl bg-lavender p-1"
              >
                {([["course", "코스 정보"], ["nearby", "주변 정보"]] as const).map(([key, label]) => {
                  const active = infoTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        if (key === "nearby") stopTracking();
                        setInfoTab(key);
                      }}
                      className={`flex-1 cursor-pointer rounded-[14px] py-2 text-[16px] font-bold transition-colors ${
                        active ? "bg-white text-ink shadow-[0px_2px_4px_0px_rgba(0,0,0,0.12)]" : "text-caption"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {infoTab === "course" ? (
                <div className="mt-4">
                  {detail.description && (
                    <div>
                      {/* 모바일: 3줄로 접고 더보기 / 데스크톱(md+): 공간이 넉넉해 전체 표시 */}
                      <p
                        ref={descRef}
                        className={`text-[14px] leading-relaxed text-ink md:line-clamp-none ${
                          descExpanded ? "" : "line-clamp-3"
                        }`}
                      >
                        {withLineBreaks(detail.description)}
                      </p>
                      {(descOverflow || descExpanded) && (
                        <button
                          type="button"
                          onClick={() => setDescExpanded((v) => !v)}
                          className="mt-1 cursor-pointer text-[13px] font-bold text-accent md:hidden"
                        >
                          {descExpanded ? "접기" : "더보기"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* 코스 대표 사진 — 원본 비율 그대로. 없으면 표시 안 함 */}
                  {detail.image_url && (
                    <img
                      src={detail.image_url}
                      alt={detail.title}
                      className="mt-3 w-full rounded-[14px]"
                    />
                  )}

                  {/* 도보 / 자전거 선택 */}
                  <div className="mt-4 flex gap-3">
                    {orderedRoutes.map((r) => (
                      <ModeCard
                        key={r.route_type}
                        route={r}
                        active={r.route_type === routeType}
                        disabled={isTracking}
                        onSelect={() => changeRouteType(r.route_type)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <Nearby
                    ref={nearbyRef}
                    courseId={courseId}
                    routeType={routeType === "자전거" ? "bicycle" : "trail"}
                    onSpotsChange={setNearbySpots}
                    onSelectedChange={(spot) => setSelectedNearbySpotId(spot?.id ?? null)}
                  />
                </div>
              )}
            </div>

            {/* 시트 하단 페이드 — 시트가 콘텐츠 중간을 자르는 게 '깨진 레이아웃'이 아니라
              '아래에 더 있음'으로 읽히게 한다. 진행 방향 카드가 역지오코딩된 주소 길이에 따라
              높이가 변해(주소 로드 전후로도 커진다) 잘리는 위치가 코스마다·로드 전후로 달라지는데,
              높이 수치로는 그걸 다 맞출 수 없어서 신호로 대신한다.
              펼침·접힘 양쪽에 다 건다: 접힘에선 진행 방향 카드가, 펼침에선 설명·사진이 잘린다.
              -mt-10으로 스크롤 영역 위에 겹쳐 레이아웃 높이는 차지하지 않는다.
              relative 래퍼를 새로 두지 않는 이유: 주변 정보 탭의 SpotDetailSheet가
              이 section을 기준으로 absolute 배치되므로 중간에 위치 기준이 생기면 안 된다. */}
            {!isTracking && (
              <div
                aria-hidden
                className="pointer-events-none -mt-10 h-10 shrink-0 bg-linear-to-t from-white to-transparent md:hidden"
              />
            )}

            {/* 따라가기 (하단 고정) */}
            {infoTab === "course" && (
            <div
              // 버튼 위 여백(mt-3=12px)과 아래 흰 여백을 같게 맞춘다.
              className="shrink-0 px-5 pt-3"
              style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
            >
              {trackingError && (
                <p role="alert" className="mb-2 text-center text-[13px] leading-relaxed text-caption">
                  {trackingError}
                </p>
              )}

              {/* 화면 유지 실패는 추적 자체는 되는 경고라 role="alert" 없이 조용히 알린다 */}
              {wakeLockFailed && (
                <p className="mb-2 break-keep text-center text-[13px] leading-relaxed text-caption">
                  {WAKE_LOCK_FAILURE_MESSAGE}
                </p>
              )}

              {showStats && (
                <TrackingStats progress={progress} remainingKm={remainingKm} eta={eta} />
              )}

              <button
                type="button"
                onClick={isTracking ? stopTracking : handleStartTracking}
                disabled={!activeRoute}
                aria-pressed={isTracking}
                className={`flex h-14 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold disabled:cursor-not-allowed disabled:opacity-50 ${
                  showStats ? "mt-3" : ""
                } ${
                  isTracking
                    ? "cursor-pointer border border-accent bg-white text-accent"
                    : "cursor-pointer bg-accent text-lavender"
                }`}
              >
                {isTracking && !currentLocation && (
                  // 작은 글리프는 뭔지 알아보기 어려워 회전 스피너로 '찾는 중'을 표현
                  <span
                    aria-hidden
                    className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
                  />
                )}
                {isTracking
                  ? currentLocation
                    ? "■ 따라가기 종료"
                    : "현재 위치 찾는 중…"
                  : `${activeRoute ? MODE_ICON[activeRoute.route_type] : "🚶"} 따라가기`}
              </button>
            </div>
           )}
          </>
        )}
      </section>
      <SidebarDrawer isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
    </div>
  );
}
