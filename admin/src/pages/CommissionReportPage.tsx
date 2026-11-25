import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui/PageHeader";
import { PageLoader } from "../components/ui/PageLoader";
import { compactInputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";
import { inr } from "../components/txn/types";

interface Row {
  user?: { id: string; name: string; phone: string; role: string };
  count: number;
  gross: number;
  tds: number;
  net: number;
}

interface Platform {
  successCount: number;
  volume: number;
  vendorCommission: number;
  surcharge: number;
  paidOut: number;
  tdsWithheld: number;
  cashback: number;
  referral: number;
  rent: number;
  netMargin: number;
}

const ROLE: Record<string, string> = { MASTER_DISTRIBUTOR: "Master Distributor", DISTRIBUTOR: "Distributor", RETAILER: "Retailer", ADMIN: "Admin" };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Commission Distribution Report: what each user earned in a period and, for the admin,
// the platform's own margin (vendor margin + surcharge − payouts − cashback − rent).
export function CommissionReportPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [applied, setApplied] = useState({ from: today(), to: today() });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);

  const load = useCallback(() => {
    setRows(null);
    api.get("/commission-slabs/distribution-report", { params: applied }).then((res) => {
      setRows(res.data.rows);
      setPlatform(res.data.platform);
    });
  }, [applied]);

  useEffect(load, [load]);

  function search(e: FormEvent) {
    e.preventDefault();
    setApplied({ from, to });
  }

  const total = (rows ?? []).reduce((a, r) => ({ gross: a.gross + r.gross, tds: a.tds + r.tds, net: a.net + r.net }), { gross: 0, tds: 0, net: 0 });

  return (
    <div>
      <PageHeader title="Commission Distribution Report" />
      <form onSubmit={search} className="mb-4 flex flex-wrap items-end gap-3 rounded-sm border border-ink-200 bg-white p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] font-bold">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={compactInputClasses} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] font-bold">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={compactInputClasses} />
        </label>
        <button type="submit" className="rounded-[3px] bg-brand-500 px-3 py-[6px] text-[12.5px] text-white hover:bg-brand-600">
          Search
        </button>
      </form>

      {rows === null ? (
        <PageLoader />
      ) : (
        <div className={user?.role === "ADMIN" ? "grid gap-5 xl:grid-cols-[1fr_380px]" : ""}>
          <Table className="min-w-0">
            <THead>
              <Th>User</Th>
              <Th>Role</Th>
              <Th className="text-right">Txns</Th>
              <Th className="text-right">Gross</Th>
              <Th className="text-right">TDS</Th>
              <Th className="text-right">Net credited</Th>
            </THead>
            <tbody>
              {rows.length === 0 ? (
                <Tr>
                  <Td colSpan={6} className="py-8 text-center text-ink-400">
                    No commission paid in this period.
                  </Td>
                </Tr>
              ) : (
                rows.map((r) => (
                  <Tr key={r.user?.id}>
                    <Td>
                      {r.user?.name} ({r.user?.phone})
                    </Td>
                    <Td>{ROLE[r.user?.role ?? ""] ?? r.user?.role}</Td>
                    <Td className="text-right">{r.count}</Td>
                    <Td className="text-right">{inr(r.gross)}</Td>
                    <Td className="text-right">{inr(r.tds)}</Td>
                    <Td className="text-right font-semibold">{inr(r.net)}</Td>
                  </Tr>
                ))
              )}
              {rows.length > 0 && (
                <tr className="border-t-2 border-ink-200 bg-ink-50 font-bold">
                  <Td colSpan={3} className="text-right">
                    Total:
                  </Td>
                  <Td className="text-right">{inr(total.gross)}</Td>
                  <Td className="text-right">{inr(total.tds)}</Td>
                  <Td className="text-right">{inr(total.net)}</Td>
                </tr>
              )}
            </tbody>
          </Table>

          {platform && (
            <Table>
              <tbody>
                {(
                  [
                    ["Successful transactions", `[ ${platform.successCount} ] ${inr(platform.volume)}`],
                    ["Vendor margin earned", inr(platform.vendorCommission)],
                    ["Surcharge collected", inr(platform.surcharge)],
                    ["Commission paid out (gross)", `− ${inr(platform.paidOut)}`],
                    ["Cashback paid", `− ${inr(platform.cashback)}`],
                    ["Referral rewards paid", `− ${inr(platform.referral)}`],
                    ["API rent", `− ${inr(platform.rent)}`],
                  ] as const
                ).map(([label, value]) => (
                  <Tr key={label}>
                    <Td className="font-semibold">{label}</Td>
                    <Td className="text-right">{value}</Td>
                  </Tr>
                ))}
                <tr className={`font-bold ${platform.netMargin >= 0 ? "bg-row-success" : "bg-row-failed"}`}>
                  <Td>Platform net margin</Td>
                  <Td className="text-right">{inr(platform.netMargin)}</Td>
                </tr>
                <Tr>
                  <Td className="text-ink-500">TDS withheld (payable to govt.)</Td>
                  <Td className="text-right text-ink-500">{inr(platform.tdsWithheld)}</Td>
                </Tr>
              </tbody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
