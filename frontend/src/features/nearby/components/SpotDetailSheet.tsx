import { useEffect, useRef, useState } from "react";
import type { NearbySpot } from "../types";
import { getTourSpotDetail, getBicycleFacilityDetail } from "../nearbyApi";

interface Props {
  spot: NearbySpot;
  onClose: () => void;
}

const FALLBACK = "-";
const CLOSE_THRESHOLD = 120; // 이만큼 아래로 끌면 닫힘

type DetailFields = Partial<{
  info_center: string;
  rest_date: string;
  use_time: string;
  parking: string;
  use_fee: string;
  first_menu: string;
  treat_menu: string;
  open_time: string;
  checkin_time: string;
  checkout_time: string;
  reservation_url: string;
  open_hours: string;
  repair_available: boolean;
  rental_fee_type: string;
  total_bikes: number;
  available_bikes: number;
}>;

export function SpotDetailSheet({ spot, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 드래그 중이 아닐 땐 이 값이 null이고, 그때는 CSS 클래스(translate-y-[28%] / md:translate-y-0)로만
  // 위치가 정해진다. h-dvh를 쓰고 있어서, 모바일 주소창이 접히고 펼쳐져도 브라우저가 알아서
  // 부드럽게 반영해준다 (JS로 픽셀을 다시 계산해서 움직이면 그 타이밍이 어긋나며 "타닥" 튀는
  // 원인이 됐었다). 드래그를 시작하는 순간에만 실제 화면상 px 위치로 전환해서 손가락을
  // 따라가게 하고, 손을 떼면 다시 null로 돌려 CSS 클래스 방식으로 복귀한다.
  const [dragTopPx, setDragTopPx] = useState<number | null>(null);
  const dragState = useRef<{ startY: number; startTop: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [detail, setDetail] = useState<DetailFields | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (spot.category === "bicycle") {
          const d = await getBicycleFacilityDetail(spot.id);
          if (cancelled) return;
          setDetail({
            open_hours: d.open_hours ?? undefined,
            repair_available: d.repair_available ?? undefined,
            rental_fee_type: d.rental_fee_type ?? undefined,
            total_bikes: d.total_bikes ?? undefined,
            available_bikes: d.available_bikes ?? undefined,
          });
        } else {
          const d = await getTourSpotDetail(String(spot.id));
          if (cancelled) return;
          setDetail(d.detail as DetailFields);
        }
      } catch {
        if (!cancelled) setDetail({});
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [spot.id, spot.category]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const top = containerRef.current?.getBoundingClientRect().top ?? 0;
    dragState.current = { startY: e.clientY, startTop: top };
    setIsDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const delta = e.clientY - dragState.current.startY;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const nextTop = Math.min(Math.max(dragState.current.startTop + delta, dragState.current.startTop), viewportHeight);
    setDragTopPx(nextTop);
  };

  const onPointerUp = () => {
    if (!dragState.current) return;
    const startTop = dragState.current.startTop;
    dragState.current = null;
    setIsDragging(false);

    const currentTop = dragTopPx ?? startTop;
    if (currentTop > startTop + CLOSE_THRESHOLD) {
      onClose();
      return;
    }
    setDragTopPx(null);
  };

  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/30" onClick={onClose} />
      <div
        ref={containerRef}
        className={`fixed inset-x-0 bottom-0 z-50 flex h-dvh translate-y-[28%] flex-col overflow-hidden rounded-t-2xl bg-white md:absolute md:h-full md:translate-y-0 ${
          isDragging ? "" : "transition-transform duration-200 ease-out"
        }`}
        style={dragTopPx != null ? { transform: `translateY(${dragTopPx}px)` } : undefined}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center py-2.5 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <span className="h-1 w-9 rounded-full bg-divider" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
          <div className="mb-3 flex items-start justify-between">
            <h2 className="text-[18px] font-bold text-ink">{spot.name}</h2>
            <button type="button" onClick={onClose} className="text-[20px] text-caption" aria-label="닫기">
              ✕
            </button>
          </div>

          <div className="aspect-video w-full overflow-hidden rounded-xl bg-lavender">
            {spot.image_url && (
              <img src={spot.image_url} alt={spot.name} className="h-full w-full object-cover" />
            )}
          </div>

          <dl className="mt-4 flex flex-col gap-2.5 text-[13px]">
            <Row label="주소" value={spot.address} />

            {detailLoading ? (
              <p className="pt-2 text-center text-caption">불러오는 중…</p>
            ) : (
              <>
                {spot.category === "attraction" && (
                  <>
                    <Row label="문의처" value={detail?.info_center} />
                    <Row label="이용시간" value={detail?.use_time} />
                    <Row label="휴무일" value={detail?.rest_date} />
                    <Row label="주차" value={detail?.parking} />
                    <Row label="입장료" value={detail?.use_fee} />
                  </>
                )}

                {spot.category === "restaurant" && (
                  <>
                    <Row label="대표메뉴" value={detail?.first_menu} />
                    <Row label="메뉴" value={detail?.treat_menu} />
                    <Row label="영업시간" value={detail?.open_time} />
                    <Row label="휴무일" value={detail?.rest_date} />
                  </>
                )}

                {spot.category === "accommodation" && (
                  <>
                    <Row
                      label="체크인/아웃"
                      value={
                        detail?.checkin_time || detail?.checkout_time
                          ? `${detail?.checkin_time ?? "-"} / ${detail?.checkout_time ?? "-"}`
                          : undefined
                      }
                    />
                    <Row label="주차" value={detail?.parking} />
                    {detail?.reservation_url ? (
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-caption">예약</dt>
                        <dd>
                          <a href={detail.reservation_url} target="_blank" rel="noreferrer" className="text-accent underline">
                            예약 페이지로 이동
                          </a>
                        </dd>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-caption">예약</dt>
                        <dd className="text-caption">예약 링크 없음</dd>
                      </div>
                    )}
                  </>
                )}

                {spot.category === "bicycle" && (
                  <>
                    <Row label="운영시간" value={detail?.open_hours} />
                    <Row
                      label="정비"
                      value={detail?.repair_available === undefined ? undefined : detail.repair_available ? "가능" : "불가능"}
                    />
                    <Row label="요금" value={detail?.rental_fee_type} />
                    <Row
                      label="대여 가능"
                      value={
                        detail?.available_bikes === undefined
                          ? undefined
                          : `${detail.available_bikes}대${detail.total_bikes != null ? ` / 총 ${detail.total_bikes}대` : ""}`
                      }
                    />
                  </>
                )}
              </>
            )}
          </dl>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-caption">{label}</dt>
      <dd className={value ? "text-ink" : "text-caption"}>{value || FALLBACK}</dd>
    </div>
  );
}