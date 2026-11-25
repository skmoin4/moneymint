import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "warning" | "info";
  size?: "sm" | "md";
}

const VARIANTS = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 disabled:bg-brand-300",
  secondary: "bg-white text-ink-700 border border-ink-300 hover:bg-ink-50 disabled:text-ink-300",
  ghost: "text-ink-600 hover:bg-ink-100 disabled:text-ink-300",
  danger: "bg-[#ed5565] text-white hover:bg-[#da4453] disabled:opacity-50",
  warning: "bg-[#f8ac59] text-white hover:bg-[#f39c3c] disabled:opacity-50",
  info: "bg-[#23c6c8] text-white hover:bg-[#1fb3b5] disabled:opacity-50",
};

const SIZES = {
  sm: "px-2.5 py-1 text-[12px]",
  md: "px-3.5 py-[7px] text-[13px]",
};

export function Button({
  children,
  loading,
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-[3px] font-normal transition-colors disabled:cursor-not-allowed ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}
