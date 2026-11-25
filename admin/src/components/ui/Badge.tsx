import type { ReactNode } from "react";
import { CheckCircle2, XCircle, Clock, RotateCcw, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

type Variant = "success" | "danger" | "warning" | "neutral" | "info";

const VARIANT_CLASSES: Record<Variant, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/20",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  neutral: "bg-ink-100 text-ink-600 ring-ink-500/20",
  info: "bg-brand-50 text-brand-700 ring-brand-600/20",
};

const STATUS_MAP: Record<string, { variant: Variant; icon?: ReactNode }> = {
  SUCCESS: { variant: "success", icon: <CheckCircle2 size={13} /> },
  ACTIVE: { variant: "success", icon: <CheckCircle2 size={13} /> },
  APPROVED: { variant: "success", icon: <CheckCircle2 size={13} /> },
  FAILED: { variant: "danger", icon: <XCircle size={13} /> },
  SUSPENDED: { variant: "danger", icon: <XCircle size={13} /> },
  REJECTED: { variant: "danger", icon: <XCircle size={13} /> },
  PENDING: { variant: "warning", icon: <Clock size={13} /> },
  REFUNDED: { variant: "warning", icon: <RotateCcw size={13} /> },
  INACTIVE: { variant: "neutral" },
  CREDIT: { variant: "success", icon: <ArrowDownCircle size={13} /> },
  DEBIT: { variant: "danger", icon: <ArrowUpCircle size={13} /> },
};

export function Badge({
  children,
  variant,
}: {
  children: string;
  variant?: Variant;
}) {
  const mapped = STATUS_MAP[children];
  const v = variant ?? mapped?.variant ?? "neutral";
  const icon = mapped?.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-bold ring-1 ring-inset ${VARIANT_CLASSES[v]}`}
    >
      {icon}
      {children.replace(/_/g, " ")}
    </span>
  );
}
