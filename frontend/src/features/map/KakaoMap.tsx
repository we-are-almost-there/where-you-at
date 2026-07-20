import { useEffect, useState } from "react";
import { CustomOverlayMap, Map, Polyline } from "react-kakao-maps-sdk";
import type { Direction } from "./courseProgress";
import type { LatLng } from "./types";

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
}

// 출발/도착 지점 라벨 + 색상 점 (디자인: 초록 출발 / 빨강 도착)
// 점(dot)을 좌표 중심에 앵커(0.5/0.5)로 고정해 폴리라인 끝점에 정확히 붙이고,
// 라벨 알약은 점 위/아래로 띄운다(absolute라 앵커 계산에 영향 없음).
// labelBelow: 출발·도착이 거의 붙어 있는 순환형 코스에서 두 라벨이 겹치지 않도록
// 한쪽을 아래로 내린다. 줌과 무관하게 항상 엇갈리므로 별도 거리 계산이 필요 없다.
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
        {/* 라벨 배경을 점과 같은 색으로 칠한다. 두 끝점이 붙어 있는 코스에서
          어느 라벨이 어느 점의 것인지 색으로 바로 짝지어 읽히게 하려는 것. */}
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
}: Props) {
  const [sdkReady, setSdkReady] = useState(false);
  const [map, setMap] = useState<kakao.maps.Map | null>(null);
  const forward = direction === "forward";

  useEffect(() => {
    // SDK 스크립트가 로드되지 않은 환경(키 누락·허용 도메인 불일치·네트워크 차단)에서도
    // 앱 전체가 흰 화면이 되지 않도록 가드. 이때 sdkReady가 false로 남아 지도 영역만 비운다.
    if (typeof kakao === "undefined") return;
    kakao.maps.load(() => setSdkReady(true));
  }, []);

  useEffect(() => {
    if (!map || waypoints.length === 0) return;
    const bounds = new kakao.maps.LatLngBounds();
    waypoints.forEach(({ lat, lng }) => bounds.extend(new kakao.maps.LatLng(lat, lng)));
    // 상하좌우 여백(px). 하단은 바텀시트에 가리는 만큼 더 줘서 코스를 위쪽 보이는 영역에 맞춘다.
    const pad = 24;
    map.setBounds(bounds, pad, pad, pad + bottomInset, pad);
  }, [map, waypoints, bottomInset]);

  useEffect(() => {
    if (!map || !followCurrentLocation || !currentLocation) return;
    map.panTo(new kakao.maps.LatLng(currentLocation.lat, currentLocation.lng));
  }, [map, currentLocation, followCurrentLocation, waypoints]);

  if (!sdkReady) return null;

  return (
    <Map
      center={{ lat: 35.1, lng: 129.0 }}
      style={{ width: "100%", height: "100%" }}
      level={9}
      onCreate={setMap}
    >
      {waypoints.length > 0 && (
        <>
          <Polyline path={waypoints} strokeWeight={4} strokeColor="#6C5CE7" strokeOpacity={0.9} />
          {/* 진행 방향을 바꿔도 각 좌표의 배지 배치(첫 지점=위, 마지막 지점=아래)는 유지한다. */}
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
      {currentLocation && <CurrentLocationMarker point={currentLocation} />}
    </Map>
  );
}
