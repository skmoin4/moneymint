import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Receipt, Download, Search, Code2 } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { PageLoader } from "../components/ui/PageLoader";
import { EmptyState } from "../components/ui/EmptyState";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Pagination } from "../components/ui/Pagination";
import { inputClasses, compactInputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";
import { useAuth } from "../context/AuthContext";
import { TransactionHistoryAdmin } from "./TransactionHistoryAdmin";

interface Transaction {
  id: string;
  type: string;
  identifier: string;
  amount: string;
  commission: string;
  status: string;
  providerRefId: string | null;
  apiResponse: Record<string, unknown> | null;
  operator: { name: string };
  apiProvider: { name: string };
  createdAt: string;
}

const STATUS_OPTIONS = ["", "PENDING", "SUCCESS", "FAILED", "REFUNDED"];
const TYPE_OPTIONS = ["", "RECHARGE", "BBPS", "DMT", "AEPS"];
const PAGE_SIZE = 10;

function RetailerTransactions() {
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get("search") ?? "";

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [viewing, setViewing] = useState<Transaction | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Keep filters in sync when the URL's ?search= changes without a remount
  // (e.g. the top bar search box navigating here while already mounted).
  useEffect(() => {
    const urlSearch = searchParams.get("search") ?? "";
    setSearchInput(urlSearch);
    setSearch(urlSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("search")]);

  useEffect(() => {
    setPage(1);
  }, [status, type, search, from, to]);

  useEffect(() => {
    setLoading(true);
    api
      .get("/recharge/history", { params: { page, pageSize: PAGE_SIZE, status, type, search, from, to } })
      .then((res) => {
        setTransactions(res.data.transactions);
        setTotal(res.data.total);
        setLoading(false);
      });
  }, [page, status, type, search, from, to]);

  async function handleExport() {
    const res = await api.get("/recharge/history/export", {
      params: { status, type, search, from, to },
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Transaction History"
        subtitle="Every recharge, bill payment, and transfer you've processed."
        action={
          <Button variant="secondary" onClick={handleExport}>
            <Download size={16} /> Export CSV
          </Button>
        }
      />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="relative flex-1 min-w-50">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search mobile / consumer #"
            className={`${inputClasses} pl-9`}
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${compactInputClasses} w-auto`}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s || "All statuses"}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className={`${compactInputClasses} w-auto`}>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t || "All types"}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={compactInputClasses} />
        </label>
        <label className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={compactInputClasses} />
        </label>
      </Card>

      {loading ? (
        <PageLoader />
      ) : transactions.length === 0 ? (
        <Card>
          <EmptyState icon={<Receipt size={22} />} message="No transactions match these filters." />
        </Card>
      ) : (
        <>
          <Table>
            <THead>
              <Th>Type</Th>
              <Th>Mobile / Consumer #</Th>
              <Th>Operator</Th>
              <Th>Provider</Th>
              <Th>Amount</Th>
              <Th>Commission</Th>
              <Th>Status</Th>
              <Th>Ref ID</Th>
              <Th>Date</Th>
              <Th />
            </THead>
            <tbody>
              {transactions.map((t) => (
                <Tr key={t.id}>
                  <Td className="text-ink-500">{t.type}</Td>
                  <Td className="font-medium text-ink-900">{t.identifier}</Td>
                  <Td>{t.operator.name}</Td>
                  <Td className="text-ink-500">{t.apiProvider.name}</Td>
                  <Td>₹{t.amount}</Td>
                  <Td className="text-emerald-600">
                    {Number(t.commission) > 0 ? `+₹${t.commission}` : "—"}
                  </Td>
                  <Td>
                    <Badge>{t.status}</Badge>
                  </Td>
                  <Td className="font-mono text-xs text-ink-400">{t.providerRefId ?? "-"}</Td>
                  <Td className="text-ink-500">{new Date(t.createdAt).toLocaleString()}</Td>
                  <Td className="text-right">
                    <button
                      onClick={() => setViewing(t)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-500 hover:bg-ink-200"
                      title="View raw provider response"
                    >
                      <Code2 size={16} />
                    </button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}

      {viewing && (
        <Modal title={`Provider Response — ${viewing.identifier}`} onClose={() => setViewing(null)}>
          <div className="mb-3 text-xs text-ink-500">
            Provider Ref: <span className="font-mono text-ink-700">{viewing.providerRefId ?? "—"}</span>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-ink-50 p-4 text-xs text-ink-700">
            {viewing.apiResponse ? JSON.stringify(viewing.apiResponse, null, 2) : "No response recorded."}
          </pre>
        </Modal>
      )}
    </div>
  );
}

// Managers get the full admin Transaction History (whole downline, every filter, bulk
// actions); retailers get their own simpler list.
export function TransactionsPage() {
  const { user } = useAuth();
  return user?.role === "RETAILER" ? <RetailerTransactions /> : <TransactionHistoryAdmin />;
}
