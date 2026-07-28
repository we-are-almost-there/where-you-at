import type { Race } from "../types";
import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL } from "../types";

interface RaceDetailSheetProps {
  race: Race | null;
  onClose: () => void;
}

function formatDateRange(start: string, end: string | null) {
  const fmt = (s: string) => {
    const d = new Date(s);
    return `${d.getMonth() + 1}.${d.getDate()}(${"일월화수목금토"[d.getDay()]})`;
  };
  if (!end || end === start) return fmt(start);
  return `${fmt(start)} ~ ${fmt(end)}`;
}

export default function RaceDetailSheet({ race, onClose }: RaceDetailSheetProps) {
  const isOpen = race !== null;

  return (
    <>
      {/* 배경 딤 처리 - SpotDetailSheet와 동일하게 클릭 시 닫힘 */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      {/* 바텀시트 본체 - translate-y로 open/close, JS 픽셀 계산 없이 CSS만 사용 */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 h-dvh max-h-[70vh] rounded-t-2xl bg-white shadow-xl transition-transform duration-300 ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {race && (
          <div className="flex h-full flex-col overflow-y-auto p-5">
            {/* 드래그 핸들 */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />

            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex flex-col gap-2">
                {race.event_type && (
                  <span
                    className="w-fit rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: EVENT_TYPE_COLOR[race.event_type] }}
                  >
                    {EVENT_TYPE_LABEL[race.event_type]}
                  </span>
                )}
                <h2 className="text-lg font-bold text-gray-900">{race.race_title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-gray-400">일정</dt>
                <dd className="text-gray-700">
                  {formatDateRange(race.start_date, race.end_date)}
                </dd>
              </div>
              {race.location_name && (
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-gray-400">장소</dt>
                  <dd className="text-gray-700">{race.location_name}</dd>
                </div>
              )}
              {race.contact && (
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-gray-400">문의</dt>
                  <dd className="text-gray-700">{race.contact}</dd>
                </div>
              )}
            </dl>

            {race.homepage_url && (
              <a
                href={
                  race.homepage_url.startsWith("http")
                    ? race.homepage_url
                    : `https://${race.homepage_url}`
                }
                target="_blank"
                rel="noreferrer"
                className="mt-6 flex items-center justify-center rounded-lg bg-[#6C5CE7] py-3 text-sm font-semibold text-white"
              >
                대회 홈페이지 바로가기
              </a>
            )}
          </div>
        )}
      </div>
    </>
  );
}