import type { ReactNode } from "react";
import { Card } from "./Card";

export function StatCard({
  label,
  value,
  icon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: "brand" | "emerald" | "rose" | "amber";
}) {
  const toneClasses: Record<string, string> = {
    brand: "bg-brand-500 text-white",
    emerald: "bg-[#1c84c6] text-white",
    rose: "bg-[#ed5565] text-white",
    amber: "bg-[#f8ac59] text-white",
  };

  return (
    <Card className="flex items-center gap-3 p-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sm ${toneClasses[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[12px] text-ink-500">{label}</div>
        <div className="truncate text-[18px] font-semibold text-ink-800">{value}</div>
      </div>
    </Card>
  );
}
