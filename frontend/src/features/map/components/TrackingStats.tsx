// 큰 수치 + 작은 단위 + 하단 캡션. 카드 폭에 반응하도록 cqi 기반 유체 크기를 쓴다.
// 세 칸이 한 줄에 서므로 계수가 작다 — 폴드(칸당 64px)에서 숫자와 단위, 캡션이 모두 들어가야 한다.
function Stat({ value, unit, caption }: { value: string; unit?: string; caption: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-baseline gap-0.5">
        <span className="whitespace-nowrap text-[clamp(17px,8cqi,30px)] font-bold leading-none text-figure">
          {value}
        </span>
        {unit && <span className="text-[clamp(11px,3.5cqi,13px)] font-bold text-caption">{unit}</span>}
      </p>
      <p className="mt-1.5 whitespace-nowrap text-[clamp(11px,5.5cqi,12px)] font-bold text-caption">
        {caption}
      </p>
    </div>
  );
}

/** 추적 중 표시하는 진행률 바 + 남은 거리 / 예상 종료 시각 + 평균 페이스. */
export function TrackingStats({
  progress,
  remainingKm,
  eta,
  pace,
}: {
  progress: number;
  remainingKm: number;
  eta: string;
  /** 이미 표기까지 마친 평균 페이스. 낼 수 없으면 자리만 채운 문자열이 온다. */
  pace: string;
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
      {/* 앞의 두 칸은 코스의 공식 거리·소요시간을 진행률로 안분한 추정치, 마지막 칸은 실제 이동 기록이다.
        한 줄에 세우느라 구분선 자리는 없어 캡션으로만 갈린다. */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat value={remainingKm.toFixed(1)} unit="km" caption="남은 거리" />
        <Stat value={eta} caption="예상 종료" />
        <Stat value={pace} caption="평균 페이스" />
      </div>
    </div>
  );
}
