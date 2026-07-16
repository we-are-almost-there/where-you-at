import { useEffect, useState } from "react";
import { CustomOverlayMap, Map, Polyline } from "react-kakao-maps-sdk";
import { getCourseGpx } from "./coursesApi";
import type { LatLng, RouteType } from "./types";

interface Props {
  /** 지정 시 해당 코스의 GPX 폴리라인을 렌더. 없으면 개요 지도만 표시(목록 뷰). */
  courseId?: number;
  routeType?: RouteType;
  startLabel?: string;
  endLabel?: string;
  /** 하단이 바텀시트에 가릴 때, 그 높이(px)만큼 코스를 위로 올려 fit (모바일). */
  bottomInset?: number;
}

// 출발/도착 지점 라벨 + 색상 점 (디자인: 초록 출발 / 빨강 도착)
// 점(dot)을 좌표 중심에 앵커(0.5/0.5)로 고정해 폴리라인 끝점에 정확히 붙이고,
// 라벨 알약은 점 위로 띄운다(absolute라 앵커 계산에 영향 없음).
function EndpointMarker({ point, color, label }: { point: LatLng; color: string; label: string }) {
  return (
    <CustomOverlayMap position={point} xAnchor={0.5} yAnchor={0.5}>
      <div className="relative">
        <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-0.5 text-[13px] font-bold text-lavender">
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

export function KakaoMap({
  courseId,
  routeType = "도보",
  startLabel = "출발",
  endLabel = "도착",
  bottomInset = 0,
}: Props) {
  const [sdkReady, setSdkReady] = useState(false);
  const [waypoints, setWaypoints] = useState<LatLng[]>([]);
  const [map, setMap] = useState<kakao.maps.Map | null>(null);

  useEffect(() => {
    // SDK 스크립트가 로드되지 않은 환경(키 누락·허용 도메인 불일치·네트워크 차단)에서도
    // 앱 전체가 흰 화면이 되지 않도록 가드. 이때 sdkReady가 false로 남아 지도 영역만 비운다.
    if (typeof kakao === "undefined") return;
    kakao.maps.load(() => setSdkReady(true));
  }, []);

  useEffect(() => {
    if (courseId == null) return; // 개요 지도(목록 뷰): waypoints는 초기값 [] 유지
    let cancelled = false;
    getCourseGpx(courseId, routeType)
      .then((wps) => !cancelled && setWaypoints(wps))
      .catch((err) => {
        if (cancelled) return;
        console.error("[KakaoMap] gpx fetch error:", err);
        setWaypoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, routeType]);

  useEffect(() => {
    if (!map || waypoints.length === 0) return;
    const bounds = new kakao.maps.LatLngBounds();
    waypoints.forEach(({ lat, lng }) => bounds.extend(new kakao.maps.LatLng(lat, lng)));
    // 상하좌우 여백(px). 하단은 바텀시트에 가리는 만큼 더 줘서 코스를 위쪽 보이는 영역에 맞춘다.
    const pad = 24;
    map.setBounds(bounds, pad, pad, pad + bottomInset, pad);
  }, [map, waypoints, bottomInset]);

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
          <EndpointMarker point={waypoints[0]} color="#03C75A" label={startLabel} />
          <EndpointMarker point={waypoints[waypoints.length - 1]} color="#FF4D4F" label={endLabel} />
        </>
      )}
    </Map>
  );
}
