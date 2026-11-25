import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// White heading band across the top of every page: title + breadcrumb on the left,
// greeting on the right. Negative margins let it span the full content width.
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { user } = useAuth();
  return (
    <div className="-mx-4 -mt-4 mb-5 border-b border-ink-200 bg-white px-5 py-4 md:-mx-6 md:-mt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-light leading-tight text-ink-800">{title}</h1>
          <nav className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-ink-600">
            <Link to="/" className="hover:text-brand-600">
              Dashboard
            </Link>
            <span className="text-ink-300">/</span>
            <span className="font-bold">{title}</span>
          </nav>
          {subtitle && <p className="mt-1.5 text-[12.5px] text-ink-500">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {action}
          <span className="hidden text-[22px] font-light text-ink-800 sm:inline">Hello, {user?.name}</span>
        </div>
      </div>
    </div>
  );
}
