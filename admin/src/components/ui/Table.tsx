import type { ReactNode } from "react";
import { Card } from "./Card";

export function Table({ children }: { children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">{children}</table>
      </div>
    </Card>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-ink-200 bg-ink-100/70">{children}</tr>
    </thead>
  );
}

export function Th({ children }: { children?: ReactNode }) {
  return (
    <th className="whitespace-nowrap px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-500">
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
  title,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
  title?: string;
}) {
  return (
    <td colSpan={colSpan} title={title} className={`whitespace-nowrap px-3.5 py-2 text-ink-700 ${className}`}>
      {children}
    </td>
  );
}

export function Tr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <tr className={`border-b border-ink-100 last:border-0 hover:bg-brand-50/40 ${className}`}>{children}</tr>
  );
}
