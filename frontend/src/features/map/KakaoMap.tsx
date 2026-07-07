import { useEffect, useState } from "react";
import { Map, Polyline } from "react-kakao-maps-sdk";

declare const kakao: any;

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const COURSE_ID = 1;

type Waypoint = { lat: number; lng: number };

export function KakaoMap() {
  const [sdkReady, setSdkReady] = useState(false);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [map, setMap] = useState<kakao.maps.Map | null>(null);

  useEffect(() => {
    // SDK 스크립트가 로드되지 않은 환경(키 누락·허용 도메인 불일치·네트워크 차단)에서도
    // 앱 전체가 흰 화면이 되지 않도록 가드. 이때 sdkReady가 false로 남아 지도 영역만 비운다.
    if (typeof kakao === "undefined") return;
    kakao.maps.load(() => setSdkReady(true));
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/courses/${COURSE_ID}/gpx`)
      .then((res) => res.json())
      .then(({ waypoints }: { waypoints: Waypoint[] }) => setWaypoints(waypoints))
      .catch((err) => console.error("[KakaoMap] fetch error:", err));
  }, []);

  useEffect(() => {
    if (!map || waypoints.length === 0) return;
    const bounds = new kakao.maps.LatLngBounds();
    waypoints.forEach(({ lat, lng }) => bounds.extend(new kakao.maps.LatLng(lat, lng)));
    map.setBounds(bounds);
  }, [map, waypoints]);

  if (!sdkReady) return null;

  return (
    <Map
      center={{ lat: 35.1, lng: 129.0 }}
      style={{ width: "100%", height: "100%" }}
      level={9}
      onCreate={setMap}
    >
      {waypoints.length > 0 && (
        <Polyline
          path={waypoints}
          strokeWeight={4}
          strokeColor="#FF6B35"
          strokeOpacity={0.9}
        />
      )}
    </Map>
  );
}
