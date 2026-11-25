import type { ReactNode } from "react";

type Variant = "success" | "danger" | "warning" | "neutral" | "info";

const VARIANT_CLASSES: Record<Variant, string> = {
  success: "bg-brand-500 text-white",
  danger: "bg-[#ed5565] text-white",
  warning: "bg-[#f8ac59] text-white",
  neutral: "bg-ink-200 text-ink-600",
  info: "bg-[#23c6c8] text-white",
};

const STATUS_MAP: Record<string, Variant> = {
  SUCCESS: "success",
  ACTIVE: "success",
  APPROVED: "success",
  PAID: "success",
  RESOLVED: "success",
  CREDIT: "success",
  FAILED: "danger",
  SUSPENDED: "danger",
  REJECTED: "danger",
  DEBIT: "danger",
  PENDING: "warning",
  OPEN: "warning",
  IN_PROGRESS: "info",
  REFUNDED: "info",
  INACTIVE: "neutral",
  CLOSED: "neutral",
};

export function Badge({
  children,
  variant,
  icon,
}: {
  children: string;
  variant?: Variant;
  icon?: ReactNode;
}) {
  const v = variant ?? STATUS_MAP[children] ?? "neutral";
  return (
    <span className={`inline-flex items-center gap-1 rounded-[3px] px-1.5 py-[1px] text-[11px] font-semibold ${VARIANT_CLASSES[v]}`}>
      {icon}
      {children.replace(/_/g, " ")}
    </span>
  );
}
