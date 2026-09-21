import { Check } from "lucide-react";
import { STAMP_SIDO, TOTAL_SIGUNGU, sidoCodeOf } from "../stampRegions";
import type { Stamp } from "../types";

/**
 * 지역 스탬프 현황. 시군구 스탬프를 시도별로 묶어, 시도마다 도장 하나와 "받은 시군구 / 전체"를 보여 준다.
 * 시도 안의 시군구 하나라도 받으면 그 시도 도장이 찍힌다. 어느 시군구인지는 스탬프 지도에서 본다.
 */
export default function StampBoard({ stamps }: { stamps: Stamp[] }) {
  const bySido = new Map<string, number>();
  for (const stamp of stamps) {
    const code = sidoCodeOf(stamp.sigunguCode);
    bySido.set(code, (bySido.get(code) ?? 0) + 1);
  }
  const collectedSido = STAMP_SIDO.filter((sido) => bySido.has(sido.code)).length;
  const percent = Math.round((collectedSido / STAMP_SIDO.length) * 100);

  return (
    <div>
      <div className="rounded-[14px] bg-lavender px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[14px] font-bold text-ink">모은 시도</p>
          <p className="text-[13px] text-muted">
            <span className="text-[20px] font-bold text-figure">{collectedSido}</span> / {STAMP_SIDO.length}
            <span className="ml-2">
              · 시군구 {stamps.length}/{TOTAL_SIGUNGU}
            </span>
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="모은 시도 스탬프"
          aria-valuemin={0}
          aria-valuemax={STAMP_SIDO.length}
          aria-valuenow={collectedSido}
          aria-valuetext={`시도 ${STAMP_SIDO.length}곳 중 ${collectedSido}곳, 시군구 ${TOTAL_SIGUNGU}곳 중 ${stamps.length}곳`}
          className="mt-2.5 h-2 overflow-hidden rounded-full bg-white"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
        {stamps.length === 0 && (
          <p className="mt-2.5 text-[13px] leading-5 text-muted">코스를 완주한 뒤 스탬프 지도에서 직접 찍어 보세요.</p>
        )}
      </div>

      <ul className="mt-4 grid grid-cols-4 gap-x-2 gap-y-3.5">
        {STAMP_SIDO.map((sido) => {
          const count = bySido.get(sido.code) ?? 0;
          const done = count > 0;
          return (
            <li key={sido.code} className="flex flex-col items-center">
              {/* 보이는 도장과 숫자는 줄임말이라 숨기고, 아래 sr-only 문장으로 한 번에 읽힌다. */}
              <span
                aria-hidden="true"
                className={`relative flex size-14 items-center justify-center rounded-full font-bold md:size-16 ${
                  sido.short.length > 2 ? "text-[12px]" : "text-[15px]"
                } ${
                  done
                    ? "-rotate-6 border-2 border-accent bg-lavender text-accent-strong"
                    : "border-2 border-dashed border-icon-muted text-muted"
                }`}
              >
                {sido.short}
                {done && (
                  <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-accent text-white">
                    <Check size={13} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span aria-hidden="true" className={`mt-1 text-[11px] ${done ? "font-bold text-accent-strong" : "text-caption"}`}>
                {count}/{sido.sigunguCount}
              </span>
              <span className="sr-only">
                {sido.name} 시군구 {sido.sigunguCount}곳 중 {count}곳
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
