import type { ReactNode } from "react";

export function FormField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

export const inputClasses =
  "w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 outline-none transition-shadow focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10";

// Same visual treatment as inputClasses but without a baked-in width, so callers can size
// it explicitly (w-24, inline-block, etc.) for compact inline controls — e.g. filter bars
// and inline table editors — without fighting Tailwind's w-full for specificity.
export const compactInputClasses =
  "rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 outline-none transition-shadow focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10";
