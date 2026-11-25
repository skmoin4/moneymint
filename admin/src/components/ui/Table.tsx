import type { ReactNode } from "react";

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-sm border border-ink-200 bg-white ${className}`}>
      <table className="w-full border-collapse text-left text-[12.5px]">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b-2 border-ink-200 bg-white">{children}</tr>
    </thead>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`whitespace-nowrap border-r border-ink-200 px-2.5 py-2 text-[12.5px] font-bold text-ink-700 last:border-r-0 ${className}`}>
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
  children?: ReactNode;
  className?: string;
  colSpan?: number;
  title?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      title={title}
      className={`border-r border-ink-200/70 px-2.5 py-2 align-top text-ink-700 last:border-r-0 ${className}`}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <tr className={`border-b border-ink-200 last:border-0 ${className || "odd:bg-[#f9f9f9] hover:bg-[#f5f5f5]"}`}>
      {children}
    </tr>
  );
}
