// 조회 실패/에러 상태 공용 쿠션. 목록·상세가 함께 쓴다.
// 위계: 제목(굵고 짙게) + 설명(얇고 연하게), 넉넉한 수직 여백, 모바일 터치 영역 확보.

interface Props {
  title: string;
  description?: string;
  onRetry?: () => void;
  onBack?: () => void;
}

export function ErrorNotice({ title, description, onRetry, onBack }: Props) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {/* 연결 끊김: 슬래시가 있는 와이파이(wifi-off) 아이콘 */}
      <svg
        className="size-10 text-caption"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M1 1l22 22" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <path d="M12 20h.01" />
      </svg>
      {/* 제목: 굵고 짙은 색 */}
      <h2 className="mt-5 text-[17px] font-bold text-ink">{title}</h2>
      {/* 설명: 얇고 연한 회색 */}
      {description && (
        <p className="mt-2.5 max-w-[300px] whitespace-pre-line text-[14px] leading-relaxed text-caption">
          {description}
        </p>
      )}
      {/* 버튼: 세로 스택 · 넓은 터치 영역(h-12, 폭 확장) */}
      {(onRetry || onBack) && (
        <div className="mt-8 flex w-full max-w-[320px] flex-col gap-2.5">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="h-12 w-full cursor-pointer rounded-xl bg-accent text-[15px] font-bold text-white"
            >
              다시 시도
            </button>
          )}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="h-12 w-full cursor-pointer rounded-xl border border-divider text-[15px] text-ink"
            >
              목록으로
            </button>
          )}
        </div>
      )}
    </div>
  );
}
