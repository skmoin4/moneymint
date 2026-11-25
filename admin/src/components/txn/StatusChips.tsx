import { inr, type StatusSummary } from "./types";

const CHIPS = [
  { key: "SUCCESS", label: "S", cls: "bg-[#1c84c6]" },
  { key: "FAILED", label: "F", cls: "bg-[#ed5565]" },
  { key: "PENDING", label: "P", cls: "bg-[#f8ac59]" },
  { key: "REFUNDED", label: "R", cls: "bg-[#23c6c8]" },
] as const;

// "S: ₹… F: ₹… P: ₹… R: ₹…" totals strip above report tables. Clicking a chip filters.
export function StatusChips({
  summary,
  only,
  onPick,
}: {
  summary: StatusSummary;
  only?: (keyof StatusSummary)[];
  onPick?: (status: keyof StatusSummary) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {CHIPS.filter((c) => !only || only.includes(c.key)).map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onPick?.(c.key)}
          title={`${summary[c.key].count} transaction(s)`}
          className={`rounded-[3px] px-2 py-[3px] text-[12px] font-bold text-white ${c.cls} ${onPick ? "hover:opacity-90" : "cursor-default"}`}
        >
          {c.label}: {inr(summary[c.key].amount)}
        </button>
      ))}
    </div>
  );
}
