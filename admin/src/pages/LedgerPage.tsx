import { useEffect, useState } from "react";
import { BookOpen, ArrowDownCircle, ArrowUpCircle, Download } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { PageLoader } from "../components/ui/PageLoader";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Pagination } from "../components/ui/Pagination";
import { compactInputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

interface LedgerEntry {
  id: string;
  type: "CREDIT" | "DEBIT";
  amount: string;
  balanceAfter: string;
  referenceType: string;
  description: string | null;
  createdAt: string;
}

const TYPE_OPTIONS = ["", "CREDIT", "DEBIT"];
const REFERENCE_OPTIONS = ["", "RECHARGE", "BBPS", "DMT", "AEPS", "FUND_TRANSFER", "COMMISSION", "REFUND", "ADJUSTMENT"];
const PAGE_SIZE = 10;

export function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [referenceType, setReferenceType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [balances, setBalances] = useState<{ opening: string; closing: string } | null>(null);

  useEffect(() => {
    setPage(1);
  }, [type, referenceType, from, to]);

  useEffect(() => {
    setLoading(true);
    api
      .get("/wallet/ledger", { params: { page, pageSize: PAGE_SIZE, type, referenceType, from, to } })
      .then((res) => {
        setEntries(res.data.entries);
        setTotal(res.data.total);
        setLoading(false);
      });
  }, [page, type, referenceType, from, to]);

  useEffect(() => {
    api.get("/wallet/opening-closing", { params: { from, to } }).then((res) => {
      setBalances({ opening: res.data.opening, closing: res.data.closing });
    });
  }, [from, to]);

  async function handleExport() {
    const res = await api.get("/wallet/ledger/export", {
      params: { type, referenceType },
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ledger.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Wallet Ledger"
        subtitle="A full audit trail of every balance change."
        action={
          <Button variant="secondary" onClick={handleExport}>
            <Download size={16} /> Export CSV
          </Button>
        }
      />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <select value={type} onChange={(e) => setType(e.target.value)} className={`${compactInputClasses} w-auto`}>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t || "All types"}
            </option>
          ))}
        </select>
        <select
          value={referenceType}
          onChange={(e) => setReferenceType(e.target.value)}
          className={`${compactInputClasses} w-auto`}
        >
          {REFERENCE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r ? r.replace("_", " ") : "All references"}
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${compactInputClasses} w-auto`} />
        <span className="text-ink-400">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${compactInputClasses} w-auto`} />
      </Card>

      {balances && (
        <div className="mb-4 flex gap-4">
          <div className="rounded-xl border border-ink-200 bg-white px-4 py-3">
            <div className="text-xs text-ink-500">Opening Balance</div>
            <div className="text-lg font-bold text-ink-900">₹{balances.opening}</div>
          </div>
          <div className="rounded-xl border border-ink-200 bg-white px-4 py-3">
            <div className="text-xs text-ink-500">Closing Balance</div>
            <div className="text-lg font-bold text-ink-900">₹{balances.closing}</div>
          </div>
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState icon={<BookOpen size={22} />} message="No ledger entries match these filters." />
        </Card>
      ) : (
        <>
          <Table>
            <THead>
              <Th>Type</Th>
              <Th>Reference</Th>
              <Th>Description</Th>
              <Th>Amount</Th>
              <Th>Balance After</Th>
              <Th>Date</Th>
            </THead>
            <tbody>
              {entries.map((e) => (
                <Tr key={e.id}>
                  <Td>
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                        e.type === "CREDIT" ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {e.type === "CREDIT" ? (
                        <ArrowDownCircle size={14} />
                      ) : (
                        <ArrowUpCircle size={14} />
                      )}
                      {e.type}
                    </span>
                  </Td>
                  <Td className="text-ink-500">{e.referenceType.replace("_", " ")}</Td>
                  <Td>{e.description ?? "-"}</Td>
                  <Td className={e.type === "CREDIT" ? "text-emerald-600" : "text-rose-600"}>
                    {e.type === "CREDIT" ? "+" : "-"}₹{e.amount}
                  </Td>
                  <Td className="font-medium text-ink-900">₹{e.balanceAfter}</Td>
                  <Td className="text-ink-500">{new Date(e.createdAt).toLocaleString()}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
