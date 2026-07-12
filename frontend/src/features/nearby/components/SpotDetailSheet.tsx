import { useRef, useState } from "react";
import type { NearbySpot } from "../types";

interface Props {
  spot: NearbySpot;
  onClose: () => void;
}

const FALLBACK = "-";
const PEEK_HEIGHT = 560; // 펼쳤을 때 기본으로 보이는 높이(px)
const CLOSE_THRESHOLD = 120; // 이만큼 아래로 끌면 닫힘

function getInitialSheet() {
  const max = Math.max(window.innerHeight - PEEK_HEIGHT, 0);
  return { translateY: max, maxTranslate: max };
}

export function SpotDetailSheet({ spot, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startY: number; startTranslate: number } | null>(null);
  const [sheet, setSheet] = useState(getInitialSheet);
  const [isDragging, setIsDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startY: e.clientY, startTranslate: sheet.translateY };
    setIsDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const delta = e.clientY - dragState.current.startY;
    const next = Math.min(
      Math.max(dragState.current.startTranslate + delta, 0),
      sheet.maxTranslate + CLOSE_THRESHOLD
    );
    setSheet((s) => ({ ...s, translateY: next }));
  };

  const onPointerUp = () => {
    if (!dragState.current) return;
    dragState.current = null;
    setIsDragging(false);

    if (sheet.translateY > sheet.maxTranslate + CLOSE_THRESHOLD - 40) {
      onClose();
      return;
    }
    // 3단계 스냅: 펼침(0) / 중간(max/2) / 접힘(max) 중 가까운 지점
    setSheet((s) => {
      const points = [0, s.maxTranslate / 2, s.maxTranslate];
      const closest = points.reduce((c, p) => (Math.abs(p - s.translateY) < Math.abs(c - s.translateY) ? p : c));
      return { ...s, translateY: closest };
    });
  };

  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/30" onClick={onClose} />
      <div
        ref={containerRef}
        className={`absolute inset-x-0 bottom-0 z-50 flex h-full flex-col overflow-hidden rounded-t-2xl bg-white ${
          isDragging ? "" : "transition-transform duration-200 ease-out"
        }`}
        style={{ transform: `translateY(${sheet.translateY}px)` }}
      >
        {/* 드래그 핸들 */}
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
            <Row icon="📍" label="주소" value={spot.address} />

            {spot.category === "attraction" && (
              <>
                <Row icon="☎️" label="문의처" value={spot.info_center} />
                <Row icon="🕐" label="이용시간" value={spot.use_time} />
                <Row icon="📅" label="휴무일" value={spot.rest_date} />
                <Row icon="🚗" label="주차" value={spot.parking} />
                <Row icon="🎫" label="입장료" value={spot.use_fee} />
              </>
            )}

            {spot.category === "restaurant" && (
              <>
                <Row icon="🍽️" label="대표메뉴" value={spot.first_menu} />
                <Row icon="🍴" label="취급메뉴" value={spot.treat_menu} />
                <Row icon="🕐" label="영업시간" value={spot.open_time} />
                <Row icon="📅" label="휴무일" value={spot.rest_date} />
              </>
            )}

            {spot.category === "accommodation" && (
              <>
                <Row
                  icon="🕐"
                  label="체크인/아웃"
                  value={
                    spot.checkin_time || spot.checkout_time
                      ? `${spot.checkin_time ?? "-"} / ${spot.checkout_time ?? "-"}`
                      : undefined
                  }
                />
                <Row icon="🚗" label="주차" value={spot.parking} />
                {spot.reservation_url ? (
                  <div className="flex gap-2">
                    <span aria-hidden="true">🔗</span>
                    <dt className="w-24 shrink-0 text-caption">예약</dt>
                    <dd>
                      <a href={spot.reservation_url} target="_blank" rel="noreferrer" className="text-accent underline">
                        예약 페이지로 이동
                      </a>
                    </dd>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <span aria-hidden="true">🔗</span>
                    <dt className="w-24 shrink-0 text-caption">예약</dt>
                    <dd className="text-caption">예약 링크 없음</dd>
                  </div>
                )}
              </>
            )}

            {spot.category === "bicycle" && (
              <>
                <Row icon="🕐" label="운영시간" value={spot.business_hours} />
                <Row
                  icon="🚗"
                  label="주차"
                  value={spot.parking_available === undefined ? undefined : spot.parking_available ? "가능" : "불가능"}
                />
              </>
            )}
          </dl>
        </div>
      </div>
    </>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value?: string }) {
  return (
    <div className="flex gap-2">
      <span aria-hidden="true">{icon}</span>
      <dt className="w-24 shrink-0 text-caption">{label}</dt>
      <dd className={value ? "text-ink" : "text-caption"}>{value || FALLBACK}</dd>
    </div>
  );
}