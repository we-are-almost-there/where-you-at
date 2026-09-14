import { useEffect, useRef, useState } from "react";
import { Map, MapMarker } from "react-kakao-maps-sdk";
import { EVENT_TYPE_COLOR } from "../types";

interface RaceMapProps {
  raceTitle: string;
  lat: number;
  lng: number;
  compact?: boolean;
  onAddressResolved?: (address: string | null) => void; //주소
}

function pinImageSrc(color: string, size: number): { src: string; height: number } {
  const height = Math.round(size * (32 / 24));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 24 32"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" fill="${color}"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`;
  return { src: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, height };
}

const RACE_MARKER_COLOR = EVENT_TYPE_COLOR.running; // 대회 위치 강조 (러닝 accent 재사용)


export default function RaceMap({ raceTitle, lat, lng, onAddressResolved, compact = false }: RaceMapProps) {
  const [sdkReady, setSdkReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [map, setMap] = useState<kakao.maps.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let requested = false;
    let retryScript: HTMLScriptElement | null = null;
    const timeout = window.setTimeout(() => {
      active = false;
      window.clearInterval(poll);
      setLoadFailed(true);
    }, 10_000);
    const loadSdk = () => {
      if (!active || requested || typeof kakao === "undefined" || !kakao.maps?.load) return;
      requested = true;
      try {
        kakao.maps.load(() => {
          if (!active) return;
          window.clearTimeout(timeout);
          window.clearInterval(poll);
          setSdkReady(true);
        });
      } catch {
        window.clearTimeout(timeout);
        window.clearInterval(poll);
        active = false;
        setLoadFailed(true);
      }
    };
    const poll = window.setInterval(loadSdk, 200);
    // 최초 SDK 요청 자체가 실패했다면 같은 설정으로 스크립트를 다시 요청한다.
    // 이미 준비된 전역 SDK와 다른 지도에서 사용하는 스크립트는 유지한다.
    if (retryCount > 0 && (typeof kakao === "undefined" || !kakao.maps?.load)) {
      const originalScript = document.querySelector<HTMLScriptElement>('script[src*="dapi.kakao.com/v2/maps/sdk.js"]');
      if (originalScript) {
        retryScript = document.createElement("script");
        retryScript.src = originalScript.src;
        retryScript.async = true;
        retryScript.onload = loadSdk;
        document.head.appendChild(retryScript);
      }
    }
    loadSdk();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      if (retryScript) {
        retryScript.onload = null;
        retryScript.remove();
      }
    };
  }, [retryCount]);

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

    let ignore = false;
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.coord2Address(lng, lat, (result, status) => {
      if (ignore) return;
      if (status === kakao.maps.services.Status.OK && result[0]) {
        const roadAddress = result[0].road_address?.address_name;
        const jibunAddress = result[0].address?.address_name;
        onAddressResolved(roadAddress ?? jibunAddress ?? null);
      } else {
        onAddressResolved(null);
      }
    });

    return () => {
      ignore = true;
    };
  }, [sdkReady, lat, lng, onAddressResolved]);

  if (loadFailed) {
    return (
      <div className={`${compact ? "h-40" : "h-64"} flex w-full flex-col items-center justify-center gap-3 rounded-t-lg bg-gray-100 px-4 text-center`}>
        <p role="status" className="text-sm text-gray-500">지도를 불러오지 못했어요.</p>
        <button type="button" onClick={() => {
          setLoadFailed(false);
          setSdkReady(false);
          setMap(null);
          setRetryCount((count) => count + 1);
        }} className="cursor-pointer rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          지도 다시 불러오기
        </button>
      </div>
    );
  }

  if (!sdkReady) {
    return <div role="status" aria-label="지도 불러오는 중" className={`${compact ? "h-40" : "h-64"} w-full animate-pulse rounded-t-lg bg-gray-100`} />;
  }

  const racePinSize = 32;
  const racePin = pinImageSrc(RACE_MARKER_COLOR, racePinSize);

  return (
    <div ref={mapContainerRef} className={`${compact ? "h-40" : "h-64"} w-full overflow-hidden rounded-t-lg`}>
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
            src: racePin.src,
            size: { width: racePinSize, height: racePin.height },
            options: { offset: { x: racePinSize / 2, y: racePin.height } },
          }}
          zIndex={10}
        />
      </Map>
    </div>
  );
}
