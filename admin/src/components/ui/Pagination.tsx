// Numbered pager: « 1 2 3 … Last », the way long report tables are paged.
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const windowStart = Math.max(1, Math.min(page - 4, totalPages - 9));
  const pages = Array.from({ length: Math.min(10, totalPages) }, (_, i) => windowStart + i);

  const cell = "min-w-8 border border-ink-200 px-2.5 py-1 text-[12px] -ml-px first:ml-0";

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-500">
      <div className="flex">
        <button onClick={() => onPageChange(1)} disabled={page <= 1} className={`${cell} bg-white disabled:text-ink-300`}>
          «
        </button>
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`${cell} ${p === page ? "border-brand-500 bg-brand-500 text-white" : "bg-white text-ink-700 hover:bg-ink-50"}`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className={`${cell} bg-white disabled:text-ink-300`}
        >
          Last
        </button>
      </div>
      <span>
        Showing {start}–{end} of {total}
      </span>
    </div>
  );
}
