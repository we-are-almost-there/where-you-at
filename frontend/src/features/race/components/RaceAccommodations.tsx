import { useEffect, useState } from "react";
import { fetchNearbyAccommodations, type NearbyAccommodation } from "../raceApi";

export default function RaceAccommodations({ eventId, hasLocation }: {
  eventId: number;
  hasLocation: boolean;
}) {
  const [items, setItems] = useState<NearbyAccommodation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hasLocation) return;
    const controller = new AbortController();
    fetchNearbyAccommodations(eventId, 5, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setItems(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [eventId, hasLocation, attempt]);

  return (
    <section aria-labelledby={`race-stays-${eventId}`} className="min-w-0 border-t border-divider pt-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h3 id={`race-stays-${eventId}`} className="text-sm font-bold text-ink">주변 숙박</h3>
        <span className="text-xs text-gray-500">대회 위치 기준 반경 5km · 가까운 순</span>
      </div>
      {!hasLocation ? (
        <p className="text-sm text-gray-500">대회 위치 정보가 없어 주변 숙박을 확인할 수 없어요.</p>
      ) : failed ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-gray-500">주변 숙박을 불러오지 못했어요.</p>
          <button type="button" onClick={() => {
            setFailed(false);
            setItems(null);
            setAttempt((value) => value + 1);
          }} className="rounded-lg border border-divider px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent">다시 시도</button>
        </div>
      ) : items === null ? (
        <p role="status" className="text-sm text-gray-500">주변 숙박을 불러오는 중...</p>
      ) : items.length === 0 ? (
        <p role="status" className="text-sm text-gray-500">반경 5km 내 등록된 숙박시설이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.content_id} className="rounded-lg border border-divider p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-sm font-semibold text-ink">{item.tour_spot_title}</p>
                <span className="shrink-0 text-xs text-gray-500">
                  직선 {item.distance_km < 1 ? `${Math.round(item.distance_km * 1000)}m` : `${item.distance_km.toFixed(1)}km`}
                </span>
              </div>
              <p className="mt-1 break-words text-xs text-gray-500">{item.addr1 || "주소 정보 없음"}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
