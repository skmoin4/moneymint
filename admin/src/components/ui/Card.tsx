import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-ink-200 bg-white shadow-sm shadow-ink-900/[0.02] ${className}`}
    >
      {children}
    </div>
  );
}
