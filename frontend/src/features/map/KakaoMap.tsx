import { useEffect, useMemo, useRef, useState } from "react";
import { CustomOverlayMap, Map, MapMarker, MarkerClusterer, Polyline } from "react-kakao-maps-sdk";
import type { Direction } from "./courseProgress";
import type { LatLng } from "./types";

// nearby 스팟 마커용 최소 타입 (features/nearby의 NearbySpot과 중복 정의 대신 필요한 필드만)
export interface NearbyMapSpot {
  id: number;
  lat: number;
  lng: number;
  category: "attraction" | "restaurant" | "accommodation" | "bicycle";
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
  /** 코스 따라가기 중 표시할 사용자의 현재 위치. */
  currentLocation?: LatLng | null;
  /** 현재 위치가 갱신될 때 지도 중심도 함께 이동할지 여부. */
  followCurrentLocation?: boolean;
  /** 주변 정보 탭에서 현재 카테고리의 스팟 목록 (지도에 마커로 표시). */
  nearbySpots?: NearbyMapSpot[];
  /** 상세 시트가 열려있는 스팟의 id — 이 마커만 강조, 나머지는 흐리게. */
  selectedSpotId?: number | null;
  /** 지도 마커 클릭 시 호출 (상세 시트 열기용). */
  onSpotMarkerClick?: (id: number) => void;
}

const NEARBY_MARKER_COLOR = "#6C5CE7";
const NEARBY_MARKER_COLOR_DIMMED = "#C4BAFA"; // 연보라 — 선택된 게 있을 때 나머지 마커용

// 원형(동그라미) 마커 SVG — 기본 상태(선택 안 됨)용
function circleImageSrc(color: string, size: number): string {
  const r = size / 2 - 1.5; // 흰 테두리(3px) 감안해서 살짝 안쪽으로
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${color}" stroke="white" stroke-width="3"/></svg>`;
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

function CurrentLocationMarker({ point }: { point: LatLng }) {
  return (
    <CustomOverlayMap position={point} xAnchor={0.5} yAnchor={0.5}>
      <div
        role="img"
        aria-label="현재 위치"
        className="size-5 rounded-full border-[3px] border-white bg-accent shadow-[0_1px_5px_rgba(0,0,0,0.4)]"
      />
    </CustomOverlayMap>
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
  nearbySpots = [],
  selectedSpotId = null,
  onSpotMarkerClick,
}: Props) {
  const [sdkReady, setSdkReady] = useState(false);
  const [map, setMap] = useState<kakao.maps.Map | null>(null);
  const forward = direction === "forward";

  useEffect(() => {
    if (typeof kakao === "undefined") return;
    kakao.maps.load(() => setSdkReady(true));
  }, []);

  useEffect(() => {
    if (!map || waypoints.length === 0) return;
    const bounds = new kakao.maps.LatLngBounds();
    waypoints.forEach(({ lat, lng }) => bounds.extend(new kakao.maps.LatLng(lat, lng)));
    const pad = 24;
    map.setBounds(bounds, pad, pad, pad + bottomInset, pad);
  }, [map, waypoints, bottomInset]);

  useEffect(() => {
    if (!map || !followCurrentLocation || !currentLocation) return;
    map.panTo(new kakao.maps.LatLng(currentLocation.lat, currentLocation.lng));
  }, [map, currentLocation, followCurrentLocation, waypoints]);
  // 스팟이 선택되면 그 위치로 확대해서, 클러스터에 묶여 있던 주변 마커들도 자연스럽게 풀려나게 한다.
 
  useEffect(() => {
    if (!map || selectedSpotId == null) return;
    const spot = nearbySpots.find((s) => s.id === selectedSpotId);
    if (!spot) return;
    const targetLevel = 3; // 이 정도면 근처에 뭉쳐있던 클러스터가 대부분 개별 마커로 풀림
    if (map.getLevel() > targetLevel) {
      map.setLevel(targetLevel);
    }
    map.panTo(new kakao.maps.LatLng(spot.lat, spot.lng));
  }, [map, selectedSpotId, nearbySpots]);

  const mapContainerRef = useRef<HTMLDivElement>(null);

  // 카카오맵 SDK는 컨테이너 크기를 마운트 시점 기준으로 캐싱한다.
  // flex/grid 레이아웃에서는 마운트 직후엔 아직 최종 크기가 확정 안 된 경우가 있어서,
  // 이때 마커의 클릭 판정 좌표가 실제 보이는 위치와 어긋난다(시각적으로는 멀쩡해 보임).
  // 컨테이너 크기가 바뀔 때마다 relayout()으로 강제 재계산시켜 이 어긋남을 막는다.
  useEffect(() => {
    if (!map || !mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      map.relayout();
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, [map]);

  const hasSelection = selectedSpotId != null;

  // 스팟별 마커 이미지(핀 아이콘)를 미리 계산 — id/카테고리/선택 여부가 바뀔 때만 재생성
  const markerImages = useMemo(() => {
    const result: Record<number, { src: string; size: [number, number]; offset: [number, number] }> = {};
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
          src: circleImageSrc(isDimmed ? NEARBY_MARKER_COLOR_DIMMED : NEARBY_MARKER_COLOR, size),
          size: [size, size],
          offset: [size / 2, size / 2], // 원의 중심이 좌표를 가리키게
        };
      }
    }
    return result;
  }, [nearbySpots, selectedSpotId, sdkReady]);

  if (!sdkReady) return null;

  return (
    <div ref={mapContainerRef} className="h-full w-full">
      <Map
        center={{ lat: 35.1, lng: 129.0 }}
        style={{ width: "100%", height: "100%" }}
        level={9}
        onCreate={setMap}
      >
        {waypoints.length > 0 && (
          <>
            <Polyline path={waypoints} strokeWeight={4} strokeColor="#6C5CE7" strokeOpacity={0.9} />
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

        {currentLocation && <CurrentLocationMarker point={currentLocation} />}
      </Map>
    </div>
  );
}