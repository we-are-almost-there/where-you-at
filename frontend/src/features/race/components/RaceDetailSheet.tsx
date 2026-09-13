import { useState } from "react";
import type { Race } from "../types";
import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL } from "../types";
import RaceMap from "./RaceMap";
import RaceAccommodations from "./RaceAccommodations";
import { formatDateRange } from "../dateUtils";

interface RaceDetailSheetProps {
  race: Race;
  onClose: () => void;
  backLabel?: string;
  inline?: boolean;
}

// TourAPI eventhomepage가 &amp; 같은 HTML 엔티티를 이스케이프하지 않은 채로
// 내려오는 경우가 있어, 링크로 쓰기 전에 디코딩한다.
function decodeHtmlEntities(text: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

export default function RaceDetailSheet({ race, onClose, backLabel, inline = false }: RaceDetailSheetProps) {
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const hasMap = race.map_x != null && race.map_y != null;

  const decodedHomepageUrl = race.homepage_url ? decodeHtmlEntities(race.homepage_url) : null;
  const homepageHref = decodedHomepageUrl
    ? decodedHomepageUrl.startsWith("http")
      ? decodedHomepageUrl
      : `https://${decodedHomepageUrl}`
    : null;

  return (
    <>
      {/* 배경 딤 처리 - SpotDetailSheet와 동일하게 클릭 시 닫힘 (모바일 전용, 데스크톱은 인라인 패널이라 불필요) */}
      {!inline && <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={onClose} />}

      {/* 바텀시트 본체 - 모바일: 하단에서 fixed로 표시(거의 풀스크린) / 데스크톱(md+): static으로 부모 컬럼에 인라인 배치 */}
      <div className={inline ? "border-t border-[#ebe8f7] bg-white" : "fixed inset-x-0 bottom-0 top-2 z-50 overflow-y-auto rounded-t-2xl bg-white shadow-xl md:static md:inset-auto md:z-auto md:overflow-visible md:rounded-none md:bg-transparent md:shadow-none"}>
        <div className={inline
          ? (hasMap
              ? "grid grid-cols-[minmax(0,1fr)_minmax(240px,32%)] items-start gap-x-8 gap-y-4 p-5 pl-24"
              : "flex flex-col gap-4 p-5 pl-24")
          : "flex flex-col gap-5 p-5 md:px-4 md:py-4"}>
          {!inline && <>
          {/* 드래그 핸들 (모바일 전용) */}
          <div className="mx-auto -mb-2 h-1 w-10 rounded-full bg-gray-200 md:hidden" />

          <button
            type="button"
            onClick={onClose}
            className="self-start text-[13px] text-gray-400 hover:text-gray-600"
          >
            ← {backLabel ?? "목록으로"}
          </button>

          {race.event_type && (
            <span
              className="w-fit rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: EVENT_TYPE_COLOR[race.event_type] }}
            >
              {EVENT_TYPE_LABEL[race.event_type]}
            </span>
          )}

          <h2 className="text-xl font-bold text-gray-900">{race.race_title}</h2>
          </>}

          <dl className="flex min-w-0 flex-col gap-3 text-sm [&_dd]:min-w-0 [&_dd]:break-words">
            {inline && (
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-gray-400">대회명</dt>
                <dd className="font-semibold text-ink [overflow-wrap:anywhere]">{race.race_title}</dd>
              </div>
            )}
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-gray-400">일정</dt>
              <dd className="text-gray-700">{formatDateRange(race.start_date, race.end_date)}</dd>
            </div>
            {race.location_name && (
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-gray-400">장소</dt>
                <dd className="text-gray-700">{race.location_name}</dd>
              </div>
            )}
            {race.contact && (
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-gray-400">주최</dt>
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
              style={{ backgroundColor: EVENT_TYPE_COLOR.running }}
            >
              대회 홈페이지 바로가기
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
                    <span className="text-gray-400">주소</span>&nbsp;&nbsp;{resolvedAddress}
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
