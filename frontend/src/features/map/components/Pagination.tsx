interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

const BLOCK_SIZE = 5; // 한 번에 노출할 페이지 번호 개수

// 현재 페이지가 속한 블록의 시작·끝·번호 목록을 계산한다 (단위테스트 대상).
// 화살표는 이 블록 단위로 이동한다: 1페이지(1–5)에서 › → 6페이지로 가 6–10 창이 열린다.
export function pageBlock(page: number, totalPages: number, blockSize = BLOCK_SIZE) {
  const blockStart = Math.floor((page - 1) / blockSize) * blockSize + 1;
  const blockEnd = Math.min(blockStart + blockSize - 1, totalPages);
  const pages = Array.from({ length: blockEnd - blockStart + 1 }, (_, i) => blockStart + i);
  return { blockStart, blockEnd, pages };
}

export function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null;

  const { blockStart, blockEnd, pages } = pageBlock(page, totalPages);
  const arrow =
    "flex size-9 items-center justify-center rounded-lg border border-divider text-[14px] text-ink disabled:opacity-40";

  return (
    <nav className="mt-6 flex items-center justify-center gap-1.5" aria-label="페이지네이션">
      <button
        type="button"
        className={`${arrow} cursor-pointer disabled:cursor-default`}
        disabled={blockStart === 1}
        onClick={() => onChange(blockStart - 1)}
        aria-label="이전 페이지 묶음"
      >
        ‹
      </button>
      {pages.map((p) => {
        const active = p === page;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={active ? "page" : undefined}
            className={
              "flex size-9 cursor-pointer items-center justify-center rounded-lg text-[14px] font-bold " +
              (active ? "bg-accent text-white" : "border border-divider text-ink")
            }
          >
            {p}
          </button>
        );
      })}
      <button
        type="button"
        className={`${arrow} cursor-pointer disabled:cursor-default`}
        disabled={blockEnd === totalPages}
        onClick={() => onChange(blockEnd + 1)}
        aria-label="다음 페이지 묶음"
      >
        ›
      </button>
    </nav>
  );
}
