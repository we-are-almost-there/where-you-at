import { Fragment, useEffect, useRef, useState } from "react";
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
  // 시트는 h-[51dvh] + bottom-0로 쉬는 위치가 이미 정해져 있다(CourseDetail 접힘 51%와 동일 비율).
  // 드래그는 닫기 전용이라 아래 방향 이동량(delta)만 다루면 된다 — 절대 좌표를 쫓을 필요가 없다.
  // 드래그 중이 아닐 땐 dragDeltaPx가 null이고 위치는 CSS(h-[51dvh]+bottom-0)로만 정해진다.
  const [dragDeltaPx, setDragDeltaPx] = useState<number | null>(null);
  const dragStartY = useRef<number | null>(null);
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
    dragStartY.current = e.clientY;
    setIsDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartY.current == null) return;
    const delta = e.clientY - dragStartY.current;
    // 아래로만 끌리게 clamp — 위로 끌어올려 펼치는 동작은 지원하지 않는다.
    setDragDeltaPx(Math.max(delta, 0));
  };

  const onPointerUp = () => {
    if (dragStartY.current == null) return;
    dragStartY.current = null;
    setIsDragging(false);

    if ((dragDeltaPx ?? 0) > CLOSE_THRESHOLD) {
      onClose();
      return;
    }
    setDragDeltaPx(null);
  };

  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/30" onClick={onClose} />
      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex h-[51dvh] flex-col overflow-hidden rounded-t-[24px] bg-white shadow-[0px_-6px_14px_0px_rgba(0,0,0,0.16)] md:absolute md:h-full md:rounded-none md:shadow-none ${
          isDragging ? "" : "transition-transform duration-200 ease-out"
        }`}
        style={dragDeltaPx != null ? { transform: `translateY(${dragDeltaPx}px)` } : undefined}
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

          <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-lavender">
            {spot.image_url ? (
              <img src={spot.image_url} alt={spot.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[13px] text-caption">준비중이에요</span>
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

        {/* 시트 하단 페이드 — CourseDetail과 동일한 처리 */}
        <div
          aria-hidden
          className="pointer-events-none -mt-10 h-10 shrink-0 bg-linear-to-t from-white to-transparent md:hidden"
        />
      </div>
    </>
  );
}

function formatTourText(text: string) {
  const lines = text.split(/<br\s*\/?>/i);

  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-caption">{label}</dt>
      <dd className={value ? "text-ink" : "text-caption"}>{value ? formatTourText(value) : FALLBACK}</dd>
    </div>
  );
}
