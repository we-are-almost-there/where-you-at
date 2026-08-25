import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CustomOverlayMap, Map, MapMarker, MarkerClusterer, Polyline } from "react-kakao-maps-sdk";
import type { Direction } from "./courseProgress";
import { haversineKm, splitIntoSegments } from "./courseSegments";
import type { LatLng } from "./types";
import { getGeolocationErrorMessage } from "./useCourseTracking";
import { Menu } from "lucide-react";

const ACCENT = "#6c5ce7"; // --color-accent (시그니처 바이올렛)

// 현재 위치 마커용 좌표 — 이동 방향(heading)이 있으면 마커가 그 방향으로 회전한다.
export interface LocationPoint {
  lat: number;
  lng: number;
  heading?: number | null;
}

// nearby 스팟 마커용 최소 타입 (features/nearby의 NearbySpot과 중복 정의 대신 필요한 필드만)
export interface NearbyMapSpot {
  id: string;
  lat: number;
  lng: number;
  category: "attraction" | "restaurant" | "accommodation" | "bicycle";
}

/**
 * 시작점이 이 거리 안쪽이면 마커가 사실상 완전히 포개져 하나로만 보인다.
 * (DMZ 본코스 ↔ 우회로는 들머리가 같아 0~5m다) 그런 마커는 어느 코스인지 특정할 수 없으므로
 * hover하면 그 지점의 코스를 모두 짚고, 클릭해도 상세로 보내지 않는다.
 */
const COINCIDENT_START_KM = 0.05;

// 목록 화면에서 지도에 뿌릴 코스 (목록 응답의 썸네일용 간략 좌표를 그대로 쓴다)
export interface CourseMapItem {
  id: number;
  title: string;
  points: LatLng[];
}

interface Props {
  /** 렌더할 코스 GPX 좌표. 비어 있으면 개요 지도만 표시(목록 뷰). */
  waypoints?: LatLng[];
  startLabel?: string;
  endLabel?: string;
  /** 사용자가 선택한 코스 진행 방향. */
  direction?: Direction;
  /** 하단이 바텀시트에 가릴 때, 그 높이(px)만큼 코스를 위로 올려 fit (모바일). */
  bottomInset?: number;
  /** 코스 따라가기 중 표시할 사용자의 현재 위치(이동 방향 heading 포함 가능). */
  currentLocation?: LocationPoint | null;
  /** 현재 위치가 갱신될 때 지도 중심도 함께 이동할지 여부. */
  followCurrentLocation?: boolean;
  /** 코스에서 벗어났을 때, 현위치에서 코스 위 가장 가까운 지점까지 그을 점선 유도선의 끝점. */
  offCourseGuidePoint?: LatLng | null;
  /** 지도 우하단에 '현재 위치로 이동' 버튼을 표시할지. */
  showLocateButton?: boolean;
  /** 주변 정보 탭에서 현재 카테고리의 스팟 목록 (지도에 마커로 표시). */
  nearbySpots?: NearbyMapSpot[];
  /** 상세 시트가 열려있는 스팟의 id — 이 마커만 강조, 나머지는 흐리게. */
  selectedSpotId?: string | null;
  /** 지도 마커 클릭 시 호출 (상세 시트 열기용). */
  onSpotMarkerClick?: (id: string) => void;
  /** 지도 좌상단에 '메뉴(사이드바 열기)' 버튼을 표시할지. 넘기지 않으면 버튼 자체가 렌더링되지 않는다. */
  onMenuClick?: () => void;
  /** 목록 화면에서 표시할 코스들 — 각 코스의 시작점에 마커를 찍는다. */
  courses?: CourseMapItem[];
  /**
   * 지금 짚고 있는 코스 id들 — 굵게 하고 나머지는 흐리게 죽인다.
   * 보통 0~1개지만, 시작점이 포개진 마커를 짚으면(본코스 ↔ 우회로) 2개 이상이 된다.
   */
  activeCourseIds?: number[];
  /** 코스를 하나로 특정해 클릭했을 때 (상세 이동용). 시작점이 포개진 마커에서는 부르지 않는다. */
  onCourseClick?: (id: number) => void;
  /**
   * 코스 마커에 커서가 올라가고 내려갈 때. 시작점이 포개진 마커는 어느 코스인지 특정할 수 없어
   * 그 지점에서 출발하는 코스 id를 모두 넘긴다(벗어나면 빈 배열).
   */
  onCourseMarkerHover?: (ids: number[]) => void;
  /** 코스 경로선에 커서가 올라가고 내려갈 때 — 마커가 포개져도 선은 갈라지므로 하나를 정확히 짚는다. */
  onCourseLineHover?: (id: number | null) => void;
  /**
   * 지도를 맞출 코스 id — 목록 카드 쪽에서 짚었을 때만 넘긴다. 벗어나면 결과 전체로 되돌아간다.
   * 마커 hover에는 넘기지 않는다. 확대하면 마커가 커서 밑에서 빠져나가 mouseout → 축소 →
   * 다시 mouseover가 되풀이되기 때문. 지도는 카드가, 목록은 마커가 움직이게 나눠 둔다.
   */
  focusCourseId?: number | null;
}

// prop 미전달 시 매 렌더 새 배열이 생겨 fit 의존성이 흔들리는 걸 막는 공용 빈 배열.
const NO_COURSES: CourseMapItem[] = [];
const NO_IDS: number[] = [];

const NEARBY_MARKER_COLOR = "#6C5CE7";
const DIMMED_ACCENT = "#C4BAFA"; // 연보라 — 선택된 게 있을 때 나머지를 죽이는 색 (주변 스팟 마커 · 목록 코스 공용)

// 원형(동그라미) 마커 SVG — 기본 상태(선택 안 됨)용
function circleImageSrc(color: string, size: number): string {
  const r = size / 2 - 1.5; // 흰 테두리(3px) 감안해서 살짝 안쪽으로
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${color}" stroke="white" stroke-width="3"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// 목록 코스 시작점 마커 — 텍스트 없는 점.
// 라벨로 카드와 짝을 맞추려던 안(거리·시간·난이도)은 같은 페이지 안에서 값이 너무 자주 겹쳐
// (거리순 정렬에서 98%) 매칭 단서 구실을 못 했다. 매칭은 양방향 hover로 처리하고,
// 마커는 카카오 기본 POI와 구분되는 것만 책임진다 — 흰 테두리 + 그림자.
function courseMarkerSrc(size: number, color: string): string {
  const pad = 3; // 그림자가 잘리지 않게 두는 여백
  const c = size / 2;
  const r = c - pad;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><filter id="s" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.45"/></filter></defs><circle cx="${c}" cy="${c}" r="${r}" fill="${color}" stroke="#fff" stroke-width="2.5" filter="url(#s)"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// 핀(물방울) SVG를 data URI로 만든다 — kakao.maps.MarkerImage는 실제 이미지 URL이 필요해서
// CustomOverlayMap(React 컴포넌트)으로는 못 만들고, 클러스터링이 되는 진짜 마커(MapMarker)엔 이 방식이 필요하다.
function pinImageSrc(color: string, size: number): string {
  const height = Math.round(size * (32 / 24));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 24 32"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" fill="${color}"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// 클러스터 배지(숫자 묶음) 스타일 — kakao 클러스터러가 만드는 실제 DOM에 적용되는 CSS.
// 스팟 개수 구간별로 크기를 3단계로 나눴다(10개 미만 / 10~29개 / 30개 이상).
const CLUSTER_STYLES = [
  {
    width: "34px",
    height: "34px",
    background: "rgba(108, 92, 231, 0.9)",
    borderRadius: "50%",
    color: "#fff",
    textAlign: "center" as const,
    lineHeight: "34px",
    fontWeight: "bold",
    fontSize: "13px",
    border: "2px solid white",
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
  },
  {
    width: "42px",
    height: "42px",
    background: "rgba(108, 92, 231, 0.9)",
    borderRadius: "50%",
    color: "#fff",
    textAlign: "center" as const,
    lineHeight: "42px",
    fontWeight: "bold",
    fontSize: "14px",
    border: "2px solid white",
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
  },
  {
    width: "50px",
    height: "50px",
    background: "rgba(108, 92, 231, 0.9)",
    borderRadius: "50%",
    color: "#fff",
    textAlign: "center" as const,
    lineHeight: "50px",
    fontWeight: "bold",
    fontSize: "16px",
    border: "2px solid white",
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
  },
];

// 출발/도착 지점 라벨 + 색상 점 (디자인: 초록 출발 / 빨강 도착)
function EndpointMarker({
  point,
  color,
  label,
  labelBelow = false,
}: {
  point: LatLng;
  color: string;
  label: string;
  labelBelow?: boolean;
}) {
  return (
    <CustomOverlayMap position={point} xAnchor={0.5} yAnchor={0.5}>
      <div className="relative">
        <span
          className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-0.5 text-[13px] font-bold text-white ${
            labelBelow ? "top-full mt-1.5" : "bottom-full mb-1.5"
          }`}
          style={{ backgroundColor: color, boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}
        >
          {label}
        </span>
        <span
          className="block size-4 rounded-full border-2 border-white"
          style={{ backgroundColor: color, boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
        />
      </div>
    </CustomOverlayMap>
  );
}

// 현재 위치 마커 — 점 + (이동 방향이 있으면) 그 방향으로 회전하는 원뿔 빔.
// 북쪽=0, 시계방향인 heading을 CSS rotate로 그대로 매핑(지도는 북쪽 고정).
function CurrentLocationMarker({ point }: { point: LocationPoint }) {
  const gradientId = useId(); // 마커가 여러 개 렌더돼도 그래디언트 id가 충돌하지 않게
  const heading = point.heading ?? null;
  const hasHeading = heading != null && !Number.isNaN(heading);
  return (
    <CustomOverlayMap position={point} xAnchor={0.5} yAnchor={0.5}>
      {/* 64px 정사각 박스의 중심에 점을 놓고, 빔 SVG는 이 박스 중심을 축으로 회전 */}
      <div className="relative grid size-16 place-items-center">
        {hasHeading && (
          <svg
            aria-hidden
            viewBox="0 0 64 64"
            className="pointer-events-none absolute inset-0 size-16"
            style={{ transform: `rotate(${heading}deg)` }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor={ACCENT} stopOpacity="0.55" />
                <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M32 32 L18 10 Q32 3 46 10 Z" fill={`url(#${gradientId})`} />
          </svg>
        )}
        <span
          role="img"
          aria-label="현재 위치"
          className="size-5 rounded-full border-[3px] border-white bg-accent shadow-[0_1px_5px_rgba(0,0,0,0.4)]"
        />
      </div>
    </CustomOverlayMap>
  );
}

// '현재 위치로 이동' 버튼 아이콘 (링을 가로지르는 십자선, 가운데는 비어 있음)
function LocateIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke={ACCENT} strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="7" />
      <line x1="12" y1="1.5" x2="12" y2="7" />
      <line x1="12" y1="17" x2="12" y2="22.5" />
      <line x1="1.5" y1="12" x2="7" y2="12" />
      <line x1="17" y1="12" x2="22.5" y2="12" />
    </svg>
  );
}

export function KakaoMap({
  waypoints = [],
  startLabel = "출발",
  endLabel = "도착",
  direction = "forward",
  bottomInset = 0,
  currentLocation = null,
  followCurrentLocation = false,
  offCourseGuidePoint = null,
  showLocateButton = false,
  nearbySpots = [],
  selectedSpotId = null,
  onSpotMarkerClick,
  onMenuClick,
  courses = NO_COURSES,
  activeCourseIds = NO_IDS,
  onCourseClick,
  onCourseMarkerHover,
  onCourseLineHover,
  focusCourseId = null,
}: Props) {
  const [sdkReady, setSdkReady] = useState(false);
  const [map, setMap] = useState<kakao.maps.Map | null>(null);
  const forward = direction === "forward";

  // 끊긴 구간(pen-up)을 직선으로 잇지 않도록 좌표를 세그먼트로 나눠 폴리라인을 여러 개 그린다.
  const segments = useMemo(() => splitIntoSegments(waypoints), [waypoints]);

  // 버튼으로 한 번 찍은 내 위치(추적과 별개). 추적이 시작되면 currentLocation이 이 역할을 대신한다.
  const [previewLocation, setPreviewLocation] = useState<LocationPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // 진행 중인 1회성 위치 요청의 콜백에서 '그 사이 추적이 시작됐는지'를 판별하기 위한 최신값 참조.
  const currentLocationRef = useRef(currentLocation);
  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  // locateError 자동 숨김 타이머 — 하나만 유지해 겹침/조기 삭제/언마운트 누수를 막는다.
  const errorTimerRef = useRef<number | null>(null);
  const showLocateError = useCallback((message: string) => {
    setLocateError(message);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = window.setTimeout(() => setLocateError(null), 4000);
  }, []);
  useEffect(() => () => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
  }, []);

  // 목표 좌표를 '보이는 영역'의 중앙에 맞춰 이동한다.
  // 모바일은 바텀시트(bottomInset)가 지도 하단을 가리므로, 그만큼 중심을 남쪽으로 내려
  // 목표가 시트 위 여백의 한가운데로 오게 한다. 데스크톱(bottomInset=0)은 그대로 중앙.
  const panToVisibleCenter = useCallback(
    (lat: number, lng: number) => {
      if (!map) return;
      const latlng = new kakao.maps.LatLng(lat, lng);
      if (bottomInset <= 0) {
        map.panTo(latlng);
        return;
      }
      const proj = map.getProjection();
      const pt = proj.pointFromCoords(latlng);
      map.panTo(proj.coordsFromPoint(new kakao.maps.Point(pt.x, pt.y + bottomInset / 2)));
    },
    [map, bottomInset],
  );

  useEffect(() => {
    if (typeof kakao === "undefined") return;
    kakao.maps.load(() => setSdkReady(true));
  }, []);

  // 확대는 살짝 지연시킨다. 카드 사이를 스쳐 지나가는 마우스에는 반응하지 않고,
  // 한 카드에 머무를 때만 그 코스로 맞춘다. 벗어날 때는 지연 없이 즉시 전체로 돌아간다.
  const [zoomedCourseId, setZoomedCourseId] = useState<number | null>(null);
  // (렌더 중 조정 — 아래 previewLocation과 같은 방식)
  if (focusCourseId == null && zoomedCourseId !== null) setZoomedCourseId(null);
  useEffect(() => {
    if (focusCourseId == null) return;
    const timer = setTimeout(() => setZoomedCourseId(focusCourseId), 300);
    return () => clearTimeout(timer);
  }, [focusCourseId]);

  // 지도 경계를 맞출 대상 좌표.
  // 상세 화면(waypoints)이면 그 코스 하나, 목록에서 카드를 짚고 있으면 그 코스, 아니면 결과 전체.
  // 확대는 애니메이션 없이 한 번에 맞춘다 — kakao의 setLevel({animate}) 옵션은 한 번 쓰고 나면
  // 이후 모든 확대/축소가 무시되는 버그가 있고, 레벨을 한 단계씩 끊어 옮기면 더 덜컹거린다.
  // waypoints가 있을 땐 그 배열을 그대로 돌려주므로, 참조가 바뀌지 않아 불필요한 재fit이 없다.
  const fitTargets = useMemo(() => {
    if (waypoints.length > 0) return waypoints;
    const zoomed = zoomedCourseId != null ? courses.find((c) => c.id === zoomedCourseId) : null;
    if (zoomed && zoomed.points.length > 0) return zoomed.points;
    return courses.flatMap((c) => c.points);
  }, [waypoints, courses, zoomedCourseId]);

  // 대상 전체가 보이도록 지도 경계를 맞춘다.
  // 추적 중에는 현위치 추적(panTo)이 우선이라 코스 fit을 건너뛴다.
  // 추적이 꺼지는 순간(따라가기 종료·'알겠어요') 이 콜백이 새로 만들어지며 코스 전체로 복귀한다.
  // (데스크톱은 bottomInset이 0 고정이라, 이 의존성이 없으면 종료 후 재fit이 안 됐다)
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const fitToCourse = useCallback(() => {
    if (!map || fitTargets.length === 0 || followCurrentLocation) return;
    const bounds = new kakao.maps.LatLngBounds();
    fitTargets.forEach(({ lat, lng }) => bounds.extend(new kakao.maps.LatLng(lat, lng)));
    const pad = 24;
    map.setBounds(bounds, pad, pad, pad + bottomInset, pad);
  }, [map, fitTargets, bottomInset, followCurrentLocation]);

  // 목록 화면에서 사용자가 지도를 직접 끌거나 확대했는지.
  // 그랬다면 '전체 뷰'가 아니라 '사용자가 보던 화면'이 돌아갈 자리가 된다.
  // drag·wheel은 사용자만 일으키는 이벤트라, 프로그램이 부른 setBounds와 헷갈릴 일이 없다.
  const [userMovedMap, setUserMovedMap] = useState(false);
  // hover 확대 직전에 담아두는 사용자의 화면. 확대가 끝나면 여기로 되돌린다.
  const userViewRef = useRef<{ center: kakao.maps.LatLng; level: number } | null>(null);
  const isCourseList = waypoints.length === 0 && courses.length > 0;

  // 결과 목록이 바뀌면(필터·페이지·탭) 사용자가 잡고 있던 화면을 놓아주고 다시 자동 맞춤한다.
  const [coursesBaseline, setCoursesBaseline] = useState(courses);
  if (coursesBaseline !== courses) {
    setCoursesBaseline(courses);
    if (userMovedMap) setUserMovedMap(false);
  }

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!map || !el || !isCourseList) return;
    const take = () => setUserMovedMap(true);
    kakao.maps.event.addListener(map, "dragstart", take);
    el.addEventListener("wheel", take, { passive: true });
    el.addEventListener("dblclick", take);
    return () => {
      kakao.maps.event.removeListener(map, "dragstart", take);
      el.removeEventListener("wheel", take);
      el.removeEventListener("dblclick", take);
    };
  }, [map, isCourseList]);

  useEffect(() => {
    if (!map) return;
    // 자동 맞춤 상태면 되돌아갈 '사용자 화면'이란 게 없다.
    if (!userMovedMap) userViewRef.current = null;

    if (zoomedCourseId != null) {
      // 확대하기 전에 사용자가 보던 화면을 담아둔다. 카드를 옮겨 다녀도 처음 것만 유지해,
      // 마지막에 마우스를 떼면 확대를 시작하기 전 화면으로 정확히 돌아간다.
      if (userMovedMap && !userViewRef.current) {
        userViewRef.current = { center: map.getCenter(), level: map.getLevel() };
      }
      fitToCourse();
      return;
    }

    // 확대 종료 — 사용자가 만들어둔 화면이 있으면 전체 뷰가 아니라 그리로 돌아간다.
    const saved = userViewRef.current;
    if (saved) {
      userViewRef.current = null;
      map.setLevel(saved.level);
      map.setCenter(saved.center);
      return;
    }
    // 사용자가 지도를 옮겨만 두고 확대를 쓴 적이 없다면 그 화면을 그대로 존중한다.
    if (userMovedMap) return;
    fitToCourse();
  }, [fitToCourse, map, zoomedCourseId, userMovedMap]);

  // '결과 전체 보기' — 사용자가 만든 화면을 버리고 자동 맞춤으로 돌아간다.
  // 켜고 끄는 모드가 아니라 누르면 끝나는 일회성 동작이라, 사용자가 기억할 상태가 없다.
  const resetMapView = () => {
    userViewRef.current = null;
    setUserMovedMap(false);
  };

  // 리사이즈 옵저버가 매번 최신 fit을 부르되 옵저버 자체는 재생성되지 않게 참조로 들고 있는다.
  // (시트 펼침/접힘 애니메이션 동안 bottomInset이 연속으로 바뀌므로 의존성으로 걸면 옵저버가 계속 재생성된다)
  const fitToCourseRef = useRef(fitToCourse);
  useEffect(() => {
    fitToCourseRef.current = fitToCourse;
  }, [fitToCourse]);

  useEffect(() => {
    if (!map || !followCurrentLocation || !currentLocation) return;
    panToVisibleCenter(currentLocation.lat, currentLocation.lng);
  }, [map, currentLocation, followCurrentLocation, panToVisibleCenter]);

  // 추적이 실제 위치를 잡으면(=따라가기 시작) 버튼의 1회성 위치 미리보기 상태를 정리한다.
  // (렌더 중 조정 — 미리보기 마커가 추적 종료 후 되살아나거나, 요청 중이던 스피너가 남는 걸 막는다.)
  if (currentLocation) {
    if (previewLocation) setPreviewLocation(null);
    if (locating) setLocating(false);
  }

  const handleLocate = () => {
    // 추적 중이면 이미 살아있는 현위치가 있으니, 새 GPS 요청·미리보기 없이 그 위치로 리센터만 한다.
    if (currentLocation) {
      panToVisibleCenter(currentLocation.lat, currentLocation.lng);
      return;
    }
    if (!navigator.geolocation) {
      showLocateError("이 기기에서는 현재 위치를 사용할 수 없어요.");
      return;
    }
    setLocateError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        // 요청이 도는 사이 따라가기가 시작됐으면 이 결과는 버린다(추적 follow와 충돌 방지).
        if (currentLocationRef.current) return;
        setLocating(false);
        setPreviewLocation({ lat: coords.latitude, lng: coords.longitude, heading: coords.heading });
        panToVisibleCenter(coords.latitude, coords.longitude);
      },
      ({ code }) => {
        if (currentLocationRef.current) return;
        setLocating(false);
        showLocateError(getGeolocationErrorMessage(code));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 3_000 },
    );
  };

  // 스팟이 선택되면 그 위치로 확대해서, 클러스터에 묶여 있던 주변 마커들도 자연스럽게 풀려나게 한다.
  useEffect(() => {
    if (!map || selectedSpotId == null) return;
    const spot = nearbySpots.find((s) => s.id === selectedSpotId);
    if (!spot) return;
    const targetLevel = 3; // 이 정도면 근처에 뭉쳐있던 클러스터가 대부분 개별 마커로 풀림
    if (map.getLevel() > targetLevel) {
      map.setLevel(targetLevel);
    }
    // panTo 대신 panToVisibleCenter를 써서, 바텀시트(bottomInset)에 가려지지 않는
    // "실제 보이는 영역"의 중앙으로 마커를 이동시킨다. 그냥 panTo면 시트가 화면 하단을
    // 덮고 있을 때 마커가 시트 뒤에 가려져 안 보이는 문제가 있었다.
    panToVisibleCenter(spot.lat, spot.lng);
  }, [map, selectedSpotId, nearbySpots, panToVisibleCenter]);

  // 카카오맵 SDK는 컨테이너 크기를 마운트 시점 기준으로 캐싱한다.
  // flex/grid 레이아웃에서는 마운트 직후엔 아직 최종 크기가 확정 안 된 경우가 있어서,
  // 이때 마커의 클릭 판정 좌표가 실제 보이는 위치와 어긋난다(시각적으로는 멀쩡해 보임).
  // 컨테이너 크기가 바뀔 때마다 relayout()으로 강제 재계산시켜 이 어긋남을 막는다.
  //
  // relayout()은 컨테이너 크기만 다시 잴 뿐 중심·줌은 그대로 두므로 경계를 다시 맞추지 않는다.
  // 창을 좌우로 반씩 나눌 때처럼 너비만 바뀌면 뷰포트 높이가 그대로여서 시트 높이(=bottomInset)도
  // 안 바뀌고, 그러면 fit 이펙트의 의존성이 하나도 안 바뀌어 재fit이 돌지 않는다. 넓은 지도 기준의
  // 경계를 좁아진 지도가 그대로 쓰게 되어 코스가 화면 밖으로 밀려난다. 그래서 여기서 함께 재fit한다.
  useEffect(() => {
    if (!map || !mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      map.relayout();
      fitToCourseRef.current();
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, [map]);

  const hasSelection = selectedSpotId != null;

  // 스팟별 마커 이미지(핀 아이콘)를 미리 계산 — id/카테고리/선택 여부가 바뀔 때만 재생성
  const markerImages = useMemo(() => {
    const result: Record<string, { src: string; size: [number, number]; offset: [number, number] }> = {};
    if (!sdkReady) return result;
    for (const spot of nearbySpots) {
      const isSelected = spot.id === selectedSpotId;
      const isDimmed = selectedSpotId != null && !isSelected;

      if (isSelected) {
        const size = 36;
        const height = Math.round(size * (32 / 24));
        result[spot.id] = {
          src: pinImageSrc(NEARBY_MARKER_COLOR, size),
          size: [size, height],
          offset: [size / 2, height], // 핀 뾰족한 끝(하단 중앙)이 좌표를 가리키게
        };
      } else {
        const size = 22;
        result[spot.id] = {
          src: circleImageSrc(isDimmed ? DIMMED_ACCENT : NEARBY_MARKER_COLOR, size),
          size: [size, size],
          offset: [size / 2, size / 2], // 원의 중심이 좌표를 가리키게
        };
      }
    }
    return result;
  }, [nearbySpots, selectedSpotId, sdkReady]);

  const activeIdSet = useMemo(() => new Set(activeCourseIds), [activeCourseIds]);
  const hasActiveCourse = courses.some((c) => activeIdSet.has(c.id));

  // 코스별로 '시작점이 포개진 동료들'을 미리 묶어 둔다(자기 자신 포함).
  // hover로 함께 짚는 범위와 클릭을 막을지 여부가 같은 판정을 써야 어긋나지 않는다.
  // 이 파일은 react-kakao-maps-sdk의 Map 컴포넌트를 import하고 있어 내장 Map을 쓸 수 없다.
  const coincidentIds = useMemo(() => {
    const groups: Record<number, number[]> = {};
    for (const c of courses) {
      const start = c.points[0];
      groups[c.id] = start
        ? courses
            .filter((o) => o.points[0] && haversineKm(start, o.points[0]) <= COINCIDENT_START_KM)
            .map((o) => o.id)
        : [c.id];
    }
    return groups;
  }, [courses]);

  // 목록 코스의 경로를 미리 세그먼트로 쪼개 둔다 (상세 지도와 같은 방식으로 gap에서 끊는다).
  const courseSegments = useMemo(
    () => courses.map((c) => ({ id: c.id, segments: splitIntoSegments(c.points) })),
    [courses],
  );

  // 코스 마커 이미지 — 코스별로 다르지 않아 상태 3종만 만들면 된다.
  // dimmed = 다른 코스가 활성일 때의 나머지. 활성만 키우는 것보다 나머지를 죽이는 쪽이 대비가 크다.
  const courseMarkerImages = useMemo(() => {
    if (!sdkReady) return null;
    const build = (size: number, color: string) => ({
      src: courseMarkerSrc(size, color),
      size: { width: size, height: size },
      options: { offset: { x: size / 2, y: size / 2 } }, // 원의 중심이 시작점을 가리키게
    });
    return {
      normal: build(22, ACCENT),
      dimmed: build(18, DIMMED_ACCENT),
      active: build(32, ACCENT),
    };
  }, [sdkReady]);

  if (!sdkReady) return null;

  return (
    <div ref={mapContainerRef} className="relative h-full w-full">
      <Map
        center={{ lat: 35.1, lng: 129.0 }}
        style={{ width: "100%", height: "100%" }}
        level={9}
        onCreate={setMap}
      >
        {waypoints.length > 0 && (
          <>
            {segments.map((seg, i) => (
              <Polyline key={i} path={seg} strokeWeight={4} strokeColor="#6C5CE7" strokeOpacity={0.9} />
            ))}
            <EndpointMarker
              point={waypoints[0]}
              color={forward ? "#03C75A" : "#FF4D4F"}
              label={forward ? startLabel : endLabel}
            />
            <EndpointMarker
              point={waypoints[waypoints.length - 1]}
              color={forward ? "#FF4D4F" : "#03C75A"}
              label={forward ? endLabel : startLabel}
              labelBelow
            />
          </>
        )}
        {/* 목록 화면: 코스 경로 + 시작점 마커.
            경로를 hover할 때만 그리면 점만 보여서 뭐가 뭔지 읽히지 않는다. 항상 그려두고
            hover한 코스만 진하게 키운다. 한 페이지 6개뿐이라 겹쳐서 지저분해질 일이 없다.
            쌓임 순서는 zIndex로 못박는다(테두리 1·활성 테두리 2·선 3·활성 선 4). 카카오는 오버레이를
            만든 순서대로 쌓는데, 활성 코스가 바뀌면 React가 폴리라인을 지웠다 다시 만들면서
            생성 순서가 뒤바뀐다. 그러면 활성 선이 이웃 코스 선 밑으로 깔린다. */}
        {courseMarkerImages && courses.length > 0 && (
          <>
            {/* 흰 테두리(casing)를 먼저 깔고 그 위에 보라선을 얹는다. 카카오 기본 지도는 주황 도로·
                파란 물길이 촘촘해서, 테두리 없는 보라선은 배경에 묻혀 안 보인다.
                테두리를 전부 먼저 깔고 선을 나중에 얹으므로, 이웃한 코스끼리(해파랑길 39↔40코스처럼)
                끝이 맞닿아도 그 사이에 테두리가 드러나지는 않는다 — 연속 구간은 한 줄로 보인다. */}
            {/* 활성 코스의 두꺼운 테두리도 이 단계에서 함께 깐다. 색 선을 다 그린 뒤에 얹으면,
                끝이 맞닿은 이웃 코스(연속 구간)의 선을 11px 흰 선이 덮어 흰 흠집이 생긴다. */}
            {courseSegments.map(({ id, segments }) => {
              const isActive = activeIdSet.has(id);
              return segments.map((seg, i) => (
                <Polyline
                  key={`case-${id}-${i}`}
                  path={seg}
                  strokeWeight={isActive ? 11 : 5}
                  strokeColor="#ffffff"
                  strokeOpacity={isActive ? 1 : 0.6}
                  zIndex={isActive ? 2 : 1}
                />
              ));
            })}
            {courseSegments.map(({ id, segments }) =>
              activeIdSet.has(id)
                ? null
                : segments.map((seg, i) => (
                    <Polyline
                      key={`${id}-${i}`}
                      path={seg}
                      // 활성 코스가 있을 때만 나머지를 연보라로 죽인다. 아무것도 안 짚었을 땐
                      // 6개 다 진한 보라 — 기본 화면이 흐리멍덩해지지 않게.
                      // 기본은 '읽히되 강조는 아닌' 정도로 눌러둔다. 대비는 hover에서 만든다.
                      strokeWeight={hasActiveCourse ? 3 : 3.5}
                      strokeColor={hasActiveCourse ? DIMMED_ACCENT : ACCENT}
                      strokeOpacity={hasActiveCourse ? 0.9 : 0.85}
                      zIndex={3}
                      onMouseover={() => onCourseLineHover?.(id)}
                      // 마커와 같은 이유로, 지금 짚혀 있는 코스일 때만 지운다.
                      // (이웃 선으로 옮길 때 새 선의 mouseover가 먼저 오는 경우가 있다)
                      onMouseout={() => {
                        if (activeIdSet.has(id)) onCourseLineHover?.(null);
                      }}
                      onClick={() => onCourseClick?.(id)}
                    />
                  )),
            )}

            {/* 활성 코스의 색 선은 맨 마지막에 — 나머지 선들보다 확실히 앞으로 나오게 */}
            {courseSegments
              .filter(({ id }) => activeIdSet.has(id))
              .flatMap(({ id, segments }) =>
                segments.map((seg, i) => (
                  <Polyline
                    key={`on-${id}-${i}`}
                    path={seg}
                    strokeWeight={6}
                    strokeColor={ACCENT}
                    strokeOpacity={1}
                    zIndex={4}
                    onMouseover={() => onCourseLineHover?.(id)}
                    onMouseout={() => {
                      if (activeIdSet.has(id)) onCourseLineHover?.(null);
                    }}
                    onClick={() => onCourseClick?.(id)}
                  />
                )),
              )}

            {courses.map((course) => {
              const start = course.points[0];
              if (!start) return null; // 좌표가 없는 코스는 찍을 자리가 없다
              const isActive = activeIdSet.has(course.id);
              // 시작점이 포개진 마커는 어느 코스를 누른 건지 알 수 없어 상세로 보내지 않는다.
              // hover가 이미 해당 카드들을 강조하고 목록까지 스크롤해 두므로 거기서 고르면 된다.
              const group = coincidentIds[course.id] ?? [course.id];
              const image = isActive
                ? courseMarkerImages.active
                : hasActiveCourse
                  ? courseMarkerImages.dimmed
                  : courseMarkerImages.normal;
              return (
                <MapMarker
                  key={course.id}
                  position={start}
                  title={course.title}
                  image={image}
                  zIndex={isActive ? 10 : 1}
                  onClick={() => {
                    if (group.length === 1) onCourseClick?.(course.id);
                  }}
                  onMouseOver={() => onCourseMarkerHover?.(group)}
                  // 마커가 붙어 있으면 다음 마커의 mouseover가 먼저 오고 이 마커의 mouseout이
                  // 뒤따를 수 있다. 그때 무조건 지우면 방금 켠 강조가 꺼진다.
                  onMouseOut={() => {
                    if (isActive) onCourseMarkerHover?.([]);
                  }}
                />
              );
            })}
          </>
        )}

        {nearbySpots.length > 0 && (
          <MarkerClusterer
            key={nearbySpots.map((s) => s.id).join(",")}
            averageCenter
            minLevel={5}
            gridSize={60}
            minClusterSize={5}
            styles={CLUSTER_STYLES}
          >
            {nearbySpots
              .filter((spot) => spot.id !== selectedSpotId)
              .map((spot) => {
                const img = markerImages[spot.id];
                if (!img) return null;
                return (
                  <MapMarker
                    key={spot.id}
                    position={{ lat: spot.lat, lng: spot.lng }}
                    image={{
                      src: img.src,
                      size: { width: img.size[0], height: img.size[1] },
                      options: { offset: { x: img.offset[0], y: img.offset[1] } },
                    }}
                    zIndex={1}
                    onClick={() => {
                      onSpotMarkerClick?.(spot.id);
                    }}
                  />
                );
              })}
          </MarkerClusterer>
        )}

        {hasSelection &&
          (() => {
            const selectedSpot = nearbySpots.find((s) => s.id === selectedSpotId);
            const img = selectedSpot ? markerImages[selectedSpot.id] : undefined;
            if (!selectedSpot || !img) return null;
            return (
              <MapMarker
                position={{ lat: selectedSpot.lat, lng: selectedSpot.lng }}
                image={{
                  src: img.src,
                  size: { width: img.size[0], height: img.size[1] },
                  options: { offset: { x: img.offset[0], y: img.offset[1] } },
                }}
                zIndex={10}
                onClick={() => onSpotMarkerClick?.(selectedSpot.id)}
              />
            );
          })()}

        {/* 코스 이탈 시 현위치→가장 가까운 코스 지점 점선 유도선 (마커보다 먼저 그려 아래에 깔림) */}
        {currentLocation && offCourseGuidePoint && (
          <Polyline
            path={[
              { lat: currentLocation.lat, lng: currentLocation.lng },
              offCourseGuidePoint,
            ]}
            strokeWeight={3}
            strokeColor="#FF4D4F"
            strokeOpacity={0.85}
            strokeStyle="shortdash"
          />
        )}

        {currentLocation && <CurrentLocationMarker point={currentLocation} />}
        {!currentLocation && previewLocation && <CurrentLocationMarker point={previewLocation} />}
      </Map>

      {/* 지도를 직접 움직여 자동 맞춤에서 벗어났을 때만 나타난다.
          이게 없으면 필터를 바꾸기 전엔 목록의 코스들을 한눈에 다시 볼 방법이 없다.
          맞추는 대상은 검색 결과 전체(수백 개)가 아니라 지금 목록에 있는 코스들이므로,
          오해가 없게 개수를 그대로 적는다. */}
      {isCourseList && userMovedMap && (
        <button
          type="button"
          onClick={resetMapView}
          className="absolute bottom-4 right-4 z-10 rounded-full bg-white px-4 py-2.5 text-[13px] font-bold text-ink shadow-[0_2px_8px_rgba(0,0,0,0.25)] transition-transform active:scale-95"
        >
          {courses.length}개 코스 모두 보기
        </button>
      )}

      {/* 현재 위치 버튼 — 바텀시트에 가리지 않게 bottomInset(모바일 시트 높이)만큼 위로 띄운다.
          데스크톱은 bottomInset=0이라 지도 우하단에 붙는다. */}
      {showLocateButton && (
        <div
          className="pointer-events-none absolute right-4 z-10 flex flex-col items-end gap-2"
          style={{ bottom: `calc(${bottomInset}px + env(safe-area-inset-bottom) + 16px)` }}
        >
          {locateError && (
            <p className="pointer-events-none max-w-[240px] rounded-lg bg-black/70 px-3 py-1.5 text-[12px] leading-snug text-white shadow-md">
              {locateError}
            </p>
          )}
          <button
            type="button"
            onClick={handleLocate}
            disabled={locating}
            aria-label="현재 위치로 이동"
            className="pointer-events-auto grid size-11 place-items-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.25)] transition-transform active:scale-95 disabled:opacity-70"
          >
            {locating ? (
              <span
                aria-hidden
                className="size-5 animate-spin rounded-full border-2 border-accent border-t-transparent"
              />
            ) : (
              <LocateIcon />
            )}
          </button>
        </div>
      )}

      {/* 사이드바 진입 버튼 — CourseDetail은 풀스크린 지도 레이아웃이라 AppHeader가 없다.
          위치추적 버튼과 대칭되는 좌상단에 배치해 지도 위 플로팅 UI로서의 일관성을 유지한다. */}
      {onMenuClick && (
        <div className="absolute left-4 top-4 z-10 md:hidden">
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="메뉴"
            className="flex h-11 items-center gap-2 rounded-full bg-white px-4 shadow-[0_2px_8px_rgba(0,0,0,0.25)] transition-transform active:scale-95"
          >
            <Menu size={20} strokeWidth={1.75} className="text-ink" />
            <span className="text-[15px] font-bold text-ink">어디까지왔니</span>
          </button>
        </div>
      )}
    </div>
  );
}
