import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`rounded-sm border border-ink-200 bg-white ${className}`}>{children}</div>;
}

/** Panel with a title strip, the basic building block of every admin screen. */
export function Panel({
  title,
  action,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`mb-5 ${className}`}>
      {title && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[17px] font-normal text-ink-800">{title}</h2>
          {action}
        </div>
      )}
      <div className={`rounded-sm border border-ink-200 bg-white ${bodyClassName}`}>{children}</div>
    </section>
  );
}
