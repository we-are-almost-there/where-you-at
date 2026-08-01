import { useEffect, useRef, useState } from "react";
import { Map, MapMarker } from "react-kakao-maps-sdk";

interface RaceMapProps {
  raceTitle: string;
  lat: number;
  lng: number;
  onAddressResolved?: (address: string | null) => void; //주소
}

function pinImageSrc(color: string, size: number): string {
  const height = Math.round(size * (32 / 24));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 24 32"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" fill="${color}"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const RACE_MARKER_COLOR = "#6C5CE7"; // 대회 위치 강조


export default function RaceMap({ raceTitle, lat, lng, onAddressResolved, }: RaceMapProps) {
  const [sdkReady, setSdkReady] = useState(false);
  const [map, setMap] = useState<kakao.maps.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof kakao === "undefined") return;
    kakao.maps.load(() => setSdkReady(true));
  }, []);

  // KakaoMap.tsx와 동일한 이유: 바텀시트/인라인 패널 애니메이션 도중 지도가 마운트되면
  // 카카오맵 SDK가 그 순간의(아직 확정 안 된) 컨테이너 크기를 캐싱해버려 지도가
  // 실제보다 좁게 그려지거나 리사이즈 시 어긋난다. 컨테이너 크기 변화를 감지해 relayout으로 보정한다.
  useEffect(() => {
    if (!map || !mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      map.relayout();
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, [map]);

  // 역지오코딩 - DB에 원본 주소(addr1)가 아직 없어서(race 테이블에 address 컬럼 미존재),
  // 좌표를 카카오맵 services.Geocoder로 실시간 변환해 도로명 주소를 얻는다.
  // TODO: race 테이블에 address 컬럼이 추가되면 이 로직은 제거하고 DB 값을 바로 쓴다.
  useEffect(() => {
    if (!sdkReady || !onAddressResolved) return;
    if (!kakao.maps.services) return;

    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.coord2Address(lng, lat, (result, status) => {
      if (status === kakao.maps.services.Status.OK && result[0]) {
        const roadAddress = result[0].road_address?.address_name;
        const jibunAddress = result[0].address?.address_name;
        onAddressResolved(roadAddress ?? jibunAddress ?? null);
      } else {
        onAddressResolved(null);
      }
    });
  }, [sdkReady, lat, lng, onAddressResolved]);

  if (!sdkReady) {
    return <div className="h-64 w-full animate-pulse rounded-t-lg bg-gray-100" />;
  }

  const racePinSize = 32;
  const racePinHeight = Math.round(racePinSize * (32 / 24));


  return (
    <div ref={mapContainerRef} className="h-64 w-full overflow-hidden rounded-t-lg">
      <Map
        center={{ lat, lng }}
        style={{ width: "100%", height: "100%" }}
        level={5}
        onCreate={setMap}
      >
        <MapMarker
          position={{ lat, lng }}
          title={raceTitle}
          image={{
            src: pinImageSrc(RACE_MARKER_COLOR, racePinSize),
            size: { width: racePinSize, height: racePinHeight },
            options: { offset: { x: racePinSize / 2, y: racePinHeight } },
          }}
          zIndex={10}
        />
      </Map>
    </div>
  );
}