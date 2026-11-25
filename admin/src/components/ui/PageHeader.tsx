import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <nav className="mb-1.5 flex items-center gap-1 text-xs text-ink-400">
        <Link to="/" className="hover:text-brand-600">
          Dashboard
        </Link>
        {title !== "Dashboard" && (
          <>
            <ChevronRight size={12} />
            <span className="text-ink-500">{title}</span>
          </>
        )}
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
