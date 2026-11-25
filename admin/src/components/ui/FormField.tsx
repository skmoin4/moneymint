import type { ReactNode } from "react";

export function FormField({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[12.5px] font-bold text-ink-700">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-ink-400">{hint}</span>}
    </label>
  );
}

export const inputClasses =
  "w-full rounded-[2px] border border-[#e5e6e7] bg-white px-3 py-[6px] text-[13px] text-ink-800 placeholder:text-ink-400 outline-none transition-colors focus:border-brand-500";

// Same treatment without a baked-in width, for inline filter bars and table editors.
export const compactInputClasses =
  "rounded-[2px] border border-[#e5e6e7] bg-white px-2.5 py-[6px] text-[13px] text-ink-800 placeholder:text-ink-400 outline-none transition-colors focus:border-brand-500";
