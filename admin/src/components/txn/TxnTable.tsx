import { Code2, Globe, Smartphone, Hand, Clock3 } from "lucide-react";
import { Table, THead, Th, Td } from "../ui/Table";
import { type AdminTxn, formatStamp, inr, procSeconds } from "./types";

const ROW_TINT: Record<AdminTxn["status"], string> = {
  SUCCESS: "bg-row-success",
  FAILED: "bg-row-failed",
  PENDING: "bg-row-pending",
  REFUNDED: "bg-row-refund",
};

const SOURCE_ICON: Record<string, { icon: typeof Code2; label: string }> = {
  API: { icon: Code2, label: "API" },
  WEB: { icon: Globe, label: "Web panel" },
  APP: { icon: Smartphone, label: "Mobile app" },
  MANUAL: { icon: Hand, label: "Manual (admin)" },
  QUEUE: { icon: Clock3, label: "Q Recharge" },
};

export function TxnTable({
  transactions,
  offset = 0,
  selected,
  onToggle,
  onToggleAll,
  onAction,
  onResponse,
  showApiBalance,
  rowTint = (t) => ROW_TINT[t.status],
}: {
  transactions: AdminTxn[];
  offset?: number;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: (checked: boolean) => void;
  onAction?: (t: AdminTxn) => void;
  onResponse: (t: AdminTxn) => void;
  showApiBalance?: boolean;
  rowTint?: (t: AdminTxn) => string;
}) {
  const selectable = Boolean(selected && onToggle);
  const allChecked = selectable && transactions.length > 0 && transactions.every((t) => selected!.has(t.id));

  return (
    <Table>
      <THead>
        <Th>S#</Th>
        {selectable && (
          <Th>
            <input
              type="checkbox"
              checked={allChecked}
              onChange={(e) => onToggleAll?.(e.target.checked)}
              aria-label="Select all rows"
            />
          </Th>
        )}
        <Th>Name</Th>
        <Th>timestamp</Th>
        <Th>Op Txn</Th>
        <Th>Provider</Th>
        <Th>Mobile</Th>
        <Th>₹ Amt.</Th>
        <Th>₹ Deduction.</Th>
        <Th>remark</Th>
        <Th>api</Th>
        {showApiBalance && <Th>apibalance</Th>}
        <Th>Action</Th>
        <Th>Source</Th>
        <Th>Proc. Time</Th>
        <Th>txnid</Th>
      </THead>
      <tbody>
        {transactions.map((t, i) => {
          const src = SOURCE_ICON[t.source] ?? SOURCE_ICON.APP;
          return (
            <tr key={t.id} className={`border-b border-white/70 ${rowTint(t)}`}>
              <Td>{offset + i + 1}</Td>
              {selectable && (
                <Td>
                  <input
                    type="checkbox"
                    checked={selected!.has(t.id)}
                    onChange={() => onToggle!(t.id)}
                    aria-label={`Select ${t.identifier}`}
                  />
                </Td>
              )}
              <Td className="min-w-40">
                {t.user.name}({t.user.phone})
                {t.user.parent && <div className="text-[11px] text-ink-500">↳ {t.user.parent.name}</div>}
              </Td>
              <Td className="whitespace-nowrap">{formatStamp(t.createdAt)}</Td>
              <Td className="max-w-36 break-all font-mono text-[11px]">{t.providerRefId ?? ""}</Td>
              <Td>{t.operator.name}</Td>
              <Td className="font-mono">{t.identifier}</Td>
              <Td className="whitespace-nowrap text-right">{inr(t.amount)}</Td>
              <Td className="whitespace-nowrap text-right">{inr(t.deduction)}</Td>
              <Td className="font-semibold" title={t.statusMessage ?? undefined}>
                {t.status}
                {t.statusMessage && <div className="max-w-40 truncate text-[11px] font-normal text-ink-500">{t.statusMessage}</div>}
              </Td>
              <Td className="whitespace-nowrap uppercase">{t.apiProvider.name}</Td>
              {showApiBalance && (
                <Td className="whitespace-nowrap text-right">
                  {t.apiProvider.walletBalance !== undefined ? inr(t.apiProvider.walletBalance) : ""}
                </Td>
              )}
              <Td>
                <div className="flex flex-col gap-0.5">
                  {onAction && (
                    <button
                      onClick={() => onAction(t)}
                      className="rounded-[3px] bg-brand-500 px-2 py-[2px] text-[11px] text-white hover:bg-brand-600"
                    >
                      Action
                    </button>
                  )}
                  <button
                    onClick={() => onResponse(t)}
                    className="rounded-[3px] bg-brand-500 px-2 py-[2px] text-[11px] text-white hover:bg-brand-600"
                  >
                    Response
                  </button>
                </div>
              </Td>
              <Td className="text-center" title={src.label}>
                <src.icon size={16} className="inline text-ink-700" aria-label={src.label} />
              </Td>
              <Td className="text-right">{procSeconds(t)}</Td>
              <Td className="font-mono text-[11px]" title={t.id}>
                {t.id.slice(0, 8)}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
