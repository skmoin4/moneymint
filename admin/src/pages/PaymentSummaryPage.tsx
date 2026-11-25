import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { PageLoader } from "../components/ui/PageLoader";
import { Panel } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { compactInputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { errorText, formatStamp, inr } from "../components/txn/types";

type Channel = "GATEWAY" | "QR" | "BANK";

interface Summary {
  count: number;
  amount: number;
  charges: number;
  net: number;
  byMethod?: { method: string; count: number; amount: number }[];
  byStatus?: Record<string, number>;
}

interface Row {
  id: string;
  amount: string;
  status: string;
  createdAt: string;
  user: { name: string; phone: string; parent?: { name: string } | null };
  // gateway / QR
  method?: string | null;
  charges?: string;
  netAmount?: string | null;
  gatewayOrderId?: string;
  gatewayPaymentId?: string | null;
  failureReason?: string | null;
  provider?: string;
  // bank
  utrNumber?: string;
  paymentMode?: string | null;
  bankAccount?: string | null;
  remarks?: string | null;
}

const TABS: { key: Channel; label: string }[] = [
  { key: "GATEWAY", label: "Payment Gateway" },
  { key: "QR", label: "Static QR" },
  { key: "BANK", label: "Bank & Direct" },
];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "Main Payment Summary": money that entered wallets through each channel, plus the
// top-up charge settings.
export function PaymentSummaryPage() {
  const [channel, setChannel] = useState<Channel>("GATEWAY");
  const [filters, setFilters] = useState({ from: today(), to: today(), user: "", status: "" });
  const [applied, setApplied] = useState(filters);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = useCallback(() => {
    setRows(null);
    api.get("/admin/payments", { params: { channel, ...applied } }).then((res) => {
      setRows(res.data.rows);
      setSummary(res.data.summary);
    });
  }, [channel, applied]);

  useEffect(load, [load]);

  function search(e: FormEvent) {
    e.preventDefault();
    setApplied(filters);
  }

  const statuses = channel === "BANK" ? ["APPROVED", "PENDING", "REJECTED"] : ["PAID", "PENDING", "FAILED"];

  return (
    <div>
      <PageHeader title="Main Payment Summary" />

      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setChannel(t.key);
              setFilters((f) => ({ ...f, status: "" }));
              setApplied((f) => ({ ...f, status: "" }));
            }}
            className={`rounded-[3px] px-3 py-[6px] text-[12.5px] ${channel === t.key ? "bg-brand-500 text-white" : "border border-ink-300 bg-white hover:bg-ink-50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={search} className="mb-4 flex flex-wrap items-end gap-3 rounded-sm border border-ink-200 bg-white p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] font-bold">From</span>
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={compactInputClasses} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] font-bold">To</span>
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={compactInputClasses} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] font-bold">User</span>
          <input value={filters.user} onChange={(e) => setFilters({ ...filters, user: e.target.value })} placeholder="Name or mobile" className={`${compactInputClasses} w-44`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] font-bold">Status</span>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={compactInputClasses}>
            <option value="">{channel === "BANK" ? "APPROVED" : "ALL"}</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-[3px] bg-brand-500 px-3 py-[6px] text-[12.5px] text-white hover:bg-brand-600">
          Search
        </button>
      </form>

      {summary && (
        <div className="mb-3 flex flex-wrap gap-1.5 text-[12px] font-bold text-white">
          <span className="rounded-[3px] bg-[#1c84c6] px-2 py-[3px]">
            {channel === "BANK" ? "Approved" : "Paid"}: [ {summary.count} ] {inr(summary.amount)}
          </span>
          {channel !== "BANK" && <span className="rounded-[3px] bg-[#f8ac59] px-2 py-[3px]">Charges: {inr(summary.charges)}</span>}
          <span className="rounded-[3px] bg-brand-500 px-2 py-[3px]">Credited: {inr(summary.net)}</span>
          {summary.byMethod?.map((m) => (
            <span key={m.method} className="rounded-[3px] bg-ink-500 px-2 py-[3px] uppercase">
              {m.method}: [ {m.count} ] {inr(m.amount)}
            </span>
          ))}
          {summary.byStatus?.FAILED ? <span className="rounded-[3px] bg-[#ed5565] px-2 py-[3px]">Failed: {summary.byStatus.FAILED}</span> : null}
        </div>
      )}

      {rows === null ? (
        <PageLoader />
      ) : channel === "BANK" ? (
        <Table className="mb-5">
          <THead>
            <Th>Date</Th>
            <Th>User</Th>
            <Th>Parent</Th>
            <Th className="text-right">Amount</Th>
            <Th>UTR</Th>
            <Th>Mode</Th>
            <Th>Deposited into</Th>
            <Th>Status</Th>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <Tr>
                <Td colSpan={8} className="py-6 text-center text-ink-400">
                  Nothing in this period.
                </Td>
              </Tr>
            ) : (
              rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap">{formatStamp(r.createdAt)}</Td>
                  <Td>
                    {r.user.name} ({r.user.phone})
                  </Td>
                  <Td>{r.user.parent?.name ?? "—"}</Td>
                  <Td className="text-right">{inr(r.amount)}</Td>
                  <Td className="font-mono">{r.utrNumber}</Td>
                  <Td>{r.paymentMode ?? "—"}</Td>
                  <Td>{r.bankAccount ?? "—"}</Td>
                  <Td>
                    <Badge>{r.status}</Badge>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      ) : (
        <Table className="mb-5">
          <THead>
            <Th>Date</Th>
            <Th>User</Th>
            <Th>Method</Th>
            <Th className="text-right">Amount</Th>
            <Th className="text-right">Charges</Th>
            <Th className="text-right">Credited</Th>
            <Th>Status</Th>
            <Th>Gateway ref</Th>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <Tr>
                <Td colSpan={8} className="py-6 text-center text-ink-400">
                  Nothing in this period.
                </Td>
              </Tr>
            ) : (
              rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap">{formatStamp(r.createdAt)}</Td>
                  <Td>
                    {r.user.name} ({r.user.phone})
                  </Td>
                  <Td className="uppercase">{r.method ?? "—"}</Td>
                  <Td className="text-right">{inr(r.amount)}</Td>
                  <Td className="text-right">{Number(r.charges ?? 0) > 0 ? inr(r.charges!) : "—"}</Td>
                  <Td className="text-right">{r.netAmount ? inr(r.netAmount) : "—"}</Td>
                  <Td>
                    <Badge>{r.status}</Badge>
                    {r.failureReason && <div className="mt-0.5 max-w-60 text-[11px] text-ink-500">{r.failureReason}</div>}
                  </Td>
                  <Td className="font-mono text-[11px]">
                    {r.provider} {r.gatewayPaymentId ?? r.gatewayOrderId}
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      )}

      <ChargeSettings />
    </div>
  );
}

const METHODS = ["upi", "card", "netbanking", "wallet", "default"];

function ChargeSettings() {
  const [rates, setRates] = useState<Record<string, string>>({});
  const [qr, setQr] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    Promise.all(["gatewayCharges", "qrChargePercent", "topupMin", "topupMax"].map((k) => api.get(`/settings/${k}`))).then(([g, q, a, b]) => {
      let parsed: Record<string, number> = {};
      try {
        parsed = JSON.parse(g.data.value ?? "{}");
      } catch {
        parsed = {};
      }
      setRates(Object.fromEntries(METHODS.map((m) => [m, parsed[m] !== undefined ? String(parsed[m]) : ""])));
      setQr(q.data.value ?? "0");
      setMin(a.data.value ?? "10");
      setMax(b.data.value ?? "100000");
    });
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const table: Record<string, number> = {};
      for (const m of METHODS) {
        if (rates[m] === "" || rates[m] === undefined) continue;
        const v = Number(rates[m]);
        if (isNaN(v) || v < 0 || v > 10) throw { response: { data: { error: `${m}: charge must be 0–10%` } } };
        table[m] = v;
      }
      const lo = Number(min);
      const hi = Number(max);
      if (!(lo > 0) || !(hi >= lo)) throw { response: { data: { error: "Check the min / max top-up amounts" } } };
      await Promise.all([
        api.put("/settings/gatewayCharges", { value: JSON.stringify(table) }),
        api.put("/settings/qrChargePercent", { value: String(Number(qr) || 0) }),
        api.put("/settings/topupMin", { value: String(lo) }),
        api.put("/settings/topupMax", { value: String(hi) }),
      ]);
      setMsg({ ok: true, text: "Saved. Applies to new payments." });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    }
  }

  return (
    <Panel title="Top-up charges & limits">
      <form onSubmit={save} className="flex flex-col gap-3 text-[12.5px]">
        <div className="flex flex-wrap items-end gap-3">
          {METHODS.map((m) => (
            <label key={m} className="flex flex-col gap-1">
              <span className="font-bold capitalize">{m === "default" ? "Other methods" : m} %</span>
              <input value={rates[m] ?? ""} onChange={(e) => setRates({ ...rates, [m]: e.target.value })} inputMode="decimal" placeholder="0" className={`${compactInputClasses} w-24`} />
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className="font-bold">Static QR %</span>
            <input value={qr} onChange={(e) => setQr(e.target.value)} inputMode="decimal" className={`${compactInputClasses} w-24`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-bold">Min top-up ₹</span>
            <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" className={`${compactInputClasses} w-28`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-bold">Max top-up ₹</span>
            <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" className={`${compactInputClasses} w-28`} />
          </label>
          <Button type="submit">Save</Button>
        </div>
        <div className="text-ink-500">Charges are deducted from the credited amount and shown to the user before paying. Leave blank for no charge.</div>
        {msg && <div className={`rounded-sm px-3 py-2 ${msg.ok ? "bg-row-success text-[#3c763d]" : "bg-row-failed text-[#a94442]"}`}>{msg.text}</div>}
      </form>
    </Panel>
  );
}
