// 큰 수치 + 작은 단위 + 하단 캡션. 카드 폭에 반응하도록 cqi 기반 유체 크기를 쓴다.
function Stat({ value, unit, caption }: { value: string; unit?: string; caption: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-baseline gap-1">
        <span className="whitespace-nowrap text-[clamp(22px,11cqi,30px)] font-bold leading-none text-figure">
          {value}
        </span>
        {unit && <span className="text-[13px] font-bold text-caption">{unit}</span>}
      </p>
      <p className="mt-1.5 text-[12px] font-bold text-caption">{caption}</p>
    </div>
  );
}

/** 추적 중 표시하는 진행률 바 + 남은 거리 / 예상 종료 시각. */
export function TrackingStats({
  progress,
  remainingKm,
  eta,
}: {
  progress: number;
  remainingKm: number;
  eta: string;
}) {
  const percent = Math.round(progress);
  return (
    <div className="@container rounded-[14px] bg-lavender px-4 py-3.5">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[12px] font-bold text-caption">진행률</span>
        <span className="text-[16px] font-bold text-accent">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="코스 진행률"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-white"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat value={remainingKm.toFixed(1)} unit="km" caption="남은 거리" />
        <Stat value={eta} caption="예상 종료" />
      </div>
    </div>
  );
}
