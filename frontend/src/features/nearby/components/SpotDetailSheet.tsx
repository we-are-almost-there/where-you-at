import { Fragment, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NearbySpot } from "../types";
import { getTourSpotDetail, getBicycleFacilityDetail } from "../nearbyApi";
import { toSafeHttpUrl } from "../../../lib/externalUrl";
import { useDialogFocus } from "../../../lib/useDialogFocus";
import { NewTabHint, StatusMessage } from "../../../components/common/a11y";

interface Props {
  spot: NearbySpot;
  onClose: () => void;
  /**
   * 시트를 그릴 요소(코스 상세 패널). 넘기면 포털로 그 바로 아래에 그려, 패널의 가려진 내용을
   * inert로 잠가도 시트는 함께 잠기지 않는다. 없으면 제자리에 그린다(테스트 등).
   */
  container?: HTMLElement | null;
  /** 닫은 뒤 초점을 받을 요소. 보통 이 장소의 카드다. */
  getReturnTarget?: () => HTMLElement | null | undefined;
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

/**
 * 주변 장소 상세. 코스 상세 패널만 덮고 지도는 그대로 두어, 시트를 연 채로 지도 마커를 눌러
 * 다른 장소로 바꿀 수 있다. 그래서 배경 전체를 막는 모달이 아니라 비모달 대화상자로 둔다
 * (aria-modal 없음). 가려진 패널 내용은 코스 상세가 inert로 잠근다.
 */
export function SpotDetailSheet({ spot, onClose, container, getReturnTarget }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useDialogFocus({ initialFocusRef: closeButtonRef, containerRef: dialogRef, onEscape: onClose, getReturnTarget });

  // 시트는 absolute+inset-0으로 밑에 깔린 CourseDetail 패널(section)을 containing block으로
  // 삼아 그 높이를 그대로 따라간다 — 패널이 접힘(51%)이든 펼침(71%)이든 항상 정확히 덮는다.
  // 드래그는 닫기 전용이라 아래 방향 이동량(delta)만 다루면 된다 — 절대 좌표를 쫓을 필요가 없다.
  // 드래그 중이 아닐 땐 dragDeltaPx가 null이고 위치는 CSS(absolute inset-0)로만 정해진다.
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
          const d = await getTourSpotDetail(spot.id);
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

  const reservationHref = toSafeHttpUrl(detail?.reservation_url);

  const sheet = (
    <>
      <div aria-hidden="true" className="absolute inset-0 z-40 bg-black/30" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-labelledby={titleId}
        className={`absolute inset-0 z-50 flex flex-col overflow-hidden rounded-t-[24px] bg-white shadow-[0px_-6px_14px_0px_rgba(0,0,0,0.16)] md:rounded-none md:shadow-none ${
          isDragging ? "" : "transition-transform duration-200 ease-out"
        }`}
        style={dragDeltaPx != null ? { transform: `translateY(${dragDeltaPx}px)` } : undefined}
      >
        {/* 끌어서 닫는 손잡이는 터치 전용 보조 수단이다. 키보드는 닫기 버튼과 Escape를 쓴다. */}
        <div
          aria-hidden="true"
          className="flex shrink-0 cursor-grab touch-none justify-center py-2.5 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <span className="h-1 w-9 rounded-full bg-divider" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
          <div className="mb-3 flex items-start justify-between">
            <h2 id={titleId} className="text-[18px] font-bold text-ink">
              {spot.name}
            </h2>
            <button ref={closeButtonRef} type="button" onClick={onClose} className="-mr-2 -mt-1 flex size-9 shrink-0 cursor-pointer items-center justify-center text-[20px] text-caption hover:text-ink" aria-label="닫기">
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

            {/* dl에는 dt·dd(와 그 묶음 div)만 둘 수 있어, 불러오는 중 표시는 목록 밖에 둔다. */}
            {!detailLoading && (
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
                    {reservationHref ? (
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-caption">예약</dt>
                        <dd>
                          <a href={reservationHref} target="_blank" rel="noreferrer" className="text-accent underline">
                            예약 페이지로 이동
                            <NewTabHint />
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
          {detailLoading && (
            <p aria-hidden="true" className="pt-2 text-center text-[13px] text-caption">
              불러오는 중…
            </p>
          )}
          <StatusMessage message={detailLoading ? "상세 정보를 불러오는 중" : ""} />
        </div>

        {/* 시트 하단 페이드 — CourseDetail과 동일한 처리 */}
        <div
          aria-hidden
          className="pointer-events-none -mt-10 h-10 shrink-0 bg-linear-to-t from-white to-transparent md:hidden"
        />
      </div>
    </>
  );

  return container ? createPortal(sheet, container) : sheet;
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
