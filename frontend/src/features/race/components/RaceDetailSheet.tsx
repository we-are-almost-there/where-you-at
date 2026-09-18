import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Race } from "../types";
import { EVENT_TYPE_BADGE_COLOR, EVENT_TYPE_LABEL } from "../types";
import RaceMap from "./RaceMap";
import RaceAccommodations from "./RaceAccommodations";
import { formatDateRange } from "../dateUtils";
import { useDialogFocus } from "../../../lib/useDialogFocus";
import { NewTabHint } from "../../../components/common/a11y";

interface RaceDetailSheetProps {
  race: Race;
  onClose: () => void;
  backLabel?: string;
  inline?: boolean;
  /** 모달(inline=false)을 닫은 뒤 초점을 받을 요소. 보통 목록·캘린더에서 누른 대회 버튼이다. */
  getReturnTarget?: () => HTMLElement | null | undefined;
}

// TourAPI eventhomepage가 &amp; 같은 HTML 엔티티를 이스케이프하지 않은 채로
// 내려오는 경우가 있어, 링크로 쓰기 전에 디코딩한다.
function decodeHtmlEntities(text: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

export default function RaceDetailSheet(props: RaceDetailSheetProps) {
  // 모바일 시트만 모달이다. 데스크톱 인라인 상세는 목록 옆 패널이라 대화상자 속성·초점 이동을 걸지 않는다.
  return props.inline ? <RaceDetailBody {...props} inline /> : <RaceDetailModal {...props} />;
}

/**
 * 모바일 상세 시트. 화면을 거의 다 덮고 배경 스크롤도 잠그므로 모달 대화상자로 둔다.
 * 포털로 body에 그리고, 뒤의 앱 전체(#root)를 inert로 잠가 Tab이 시트 밖으로 나가지 않게 한다
 * (개인정보처리방침 팝업과 같은 방식).
 */
function RaceDetailModal(props: RaceDetailSheetProps) {
  const { onClose, getReturnTarget } = props;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    root.inert = true;
    return () => {
      root.inert = false;
    };
  }, []);
  // inert를 거는 이펙트보다 뒤에 둔다. 정리도 선언 순서대로 돌아서, 닫힐 때 inert가 먼저 풀린 뒤 초점이 돌아간다.
  useDialogFocus({ initialFocusRef: backButtonRef, containerRef: dialogRef, onEscape: onClose, getReturnTarget });

  return createPortal(
    <RaceDetailBody
      {...props}
      inline={false}
      dialog={{ ref: dialogRef, titleId, backButtonRef }}
    />,
    document.body,
  );
}

interface DialogWiring {
  ref: RefObject<HTMLDivElement | null>;
  titleId: string;
  backButtonRef: RefObject<HTMLButtonElement | null>;
}

function RaceDetailBody({
  race,
  onClose,
  backLabel,
  inline = false,
  dialog,
}: RaceDetailSheetProps & { dialog?: DialogWiring }) {
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const hasMap = race.map_x != null && race.map_y != null;

  useEffect(() => {
    if (inline) return;
    const mobile = window.matchMedia("(max-width: 767px)");
    let unlock: (() => void) | undefined;
    const syncScrollLock = () => {
      unlock?.();
      unlock = undefined;
      if (!mobile.matches) return;
      const root = document.documentElement;
      const body = document.body;
      const rootOverflow = root.style.overflow;
      const bodyOverflow = body.style.overflow;
      const gutter = root.style.scrollbarGutter;
      root.style.overflow = "hidden";
      body.style.overflow = "hidden";
      root.style.scrollbarGutter = "auto";
      unlock = () => {
        root.style.overflow = rootOverflow;
        body.style.overflow = bodyOverflow;
        root.style.scrollbarGutter = gutter;
      };
    };
    syncScrollLock();
    mobile.addEventListener("change", syncScrollLock);
    return () => {
      mobile.removeEventListener("change", syncScrollLock);
      unlock?.();
    };
  }, [inline]);

  const decodedHomepageUrl = race.homepage_url ? decodeHtmlEntities(race.homepage_url) : null;
  const homepageHref = decodedHomepageUrl
    ? decodedHomepageUrl.startsWith("http")
      ? decodedHomepageUrl
      : `https://${decodedHomepageUrl}`
    : null;

  return (
    <>
      {/* 배경 딤 처리 - SpotDetailSheet와 동일하게 클릭 시 닫힘 (모바일 전용, 데스크톱은 인라인 패널이라 불필요) */}
      {!inline && <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={onClose} />}

      {/* 바텀시트 본체 - 모바일: 하단에서 fixed로 표시(거의 풀스크린) / 데스크톱(md+): static으로 부모 컬럼에 인라인 배치 */}
      <div
        ref={dialog?.ref}
        role={dialog ? "dialog" : undefined}
        aria-modal={dialog ? true : undefined}
        aria-labelledby={dialog?.titleId}
        className={inline ? "border-t border-divider-soft bg-white" : "fixed inset-x-0 bottom-0 top-2 z-50 overflow-y-auto overscroll-y-contain rounded-t-2xl bg-white shadow-xl md:static md:inset-auto md:z-auto md:overflow-visible md:rounded-none md:bg-transparent md:shadow-none"}>
        <div className={inline
          ? (hasMap
              ? "grid grid-cols-[minmax(0,1fr)_minmax(240px,32%)] items-start gap-x-8 gap-y-4 p-5 pl-24"
              : "flex flex-col gap-4 p-5 pl-24")
          : "flex flex-col gap-5 p-5 md:px-4 md:py-4"}>
          {!inline && <>
          {/* 드래그 핸들 (모바일 전용) */}
          <div aria-hidden="true" className="mx-auto -mb-2 h-1 w-10 rounded-full bg-gray-200 md:hidden" />

          <button
            ref={dialog?.backButtonRef}
            type="button"
            onClick={onClose}
            className="-my-1 min-h-8 self-start text-[13px] text-muted hover:text-ink"
          >
            <span aria-hidden="true">←</span> {backLabel ?? "목록으로"}
          </button>

          {race.event_type && (
            <span
              className="w-fit rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: EVENT_TYPE_BADGE_COLOR[race.event_type] }}
            >
              {EVENT_TYPE_LABEL[race.event_type]}
            </span>
          )}

          <h2 id={dialog?.titleId} className="text-xl font-bold text-ink">
            {race.race_title}
          </h2>
          </>}

          <dl className="flex min-w-0 flex-col gap-3 text-sm [&_dd]:min-w-0 [&_dd]:break-words">
            {inline && (
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-muted">대회명</dt>
                <dd className="font-semibold text-ink [overflow-wrap:anywhere]">{race.race_title}</dd>
              </div>
            )}
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-muted">일정</dt>
              <dd className="text-gray-700">{formatDateRange(race.start_date, race.end_date)}</dd>
            </div>
            {race.location_name && (
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-muted">장소</dt>
                <dd className="text-gray-700">{race.location_name}</dd>
              </div>
            )}
            {race.contact && (
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-muted">주최</dt>
                <dd className="text-gray-700">{race.contact}</dd>
              </div>
            )}
          </dl>

          {homepageHref && (
            <a
              href={homepageHref}
              target="_blank"
              rel="noreferrer"
              className={`rounded-lg py-3 text-center text-sm font-semibold text-white ${inline ? "col-start-1 w-fit px-5" : ""}`}
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              대회 홈페이지 바로가기
              <NewTabHint />
            </a>
          )}

          {/* 지도 - 주소는 dl이 아니라 지도 캡션으로 표시 (텍스트 라벨 방식) */}
          {hasMap && (
            <div className={inline ? "col-start-2 row-start-1 row-span-2 min-w-0" : ""}>
              <RaceMap
                compact={inline}
                raceTitle={race.race_title}
                lat={race.map_y!}
                lng={race.map_x!}
                onAddressResolved={setResolvedAddress}
              />
              {resolvedAddress && (
                <div className="rounded-b-lg border border-t-0 border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500">
                    <span className="text-muted">주소</span>&nbsp;&nbsp;{resolvedAddress}
                  </p>
                </div>
              )}
            </div>
          )}
          <div className={inline ? "col-span-full min-w-0" : "min-w-0"}>
            <RaceAccommodations key={`${race.event_id}-${hasMap}`} eventId={race.event_id} hasLocation={hasMap} />
          </div>
        </div>
      </div>
    </>
  );
}
