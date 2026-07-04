interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const arrow =
    "flex size-9 items-center justify-center rounded-lg border border-divider text-[14px] text-ink disabled:opacity-40";

  return (
    <nav className="mt-6 flex items-center justify-center gap-1.5" aria-label="페이지네이션">
      <button
        type="button"
        className={`${arrow} cursor-pointer disabled:cursor-default`}
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        aria-label="이전 페이지"
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
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="다음 페이지"
      >
        ›
      </button>
    </nav>
  );
}
