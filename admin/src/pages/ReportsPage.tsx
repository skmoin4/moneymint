import { useEffect, useState } from "react";
import { BarChart3, Search } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { inputClasses, compactInputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

interface OperatorStat {
  id: string;
  name: string;
  code: string;
  total: number;
  success: number;
  amount: number;
  commission: number;
}

interface UserStat {
  id: string;
  name: string;
  phone: string;
  total: number;
  success: number;
  amount: number;
}

interface ProviderStat {
  id: string;
  name: string;
  code: string;
  total: number;
  success: number;
  failed: number;
}

const TABS = [
  "Operator-wise",
  "User-wise",
  "API-wise",
  "Individual",
  "Refund",
  "Opening/Closing",
  "Secondary Sales",
  "Retailer Activity",
  "Profit",
] as const;
type Tab = (typeof TABS)[number];

function DateFilters({
  from,
  to,
  setFrom,
  setTo,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${compactInputClasses} w-auto`} />
      <span className="text-ink-400">to</span>
      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${compactInputClasses} w-auto`} />
    </Card>
  );
}

function OperatorWiseTab() {
  const [operators, setOperators] = useState<OperatorStat[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/recharge/operator-stats").then((res) => {
      setOperators(res.data.operators);
      setLoading(false);
    });
  }, []);
  if (loading) return null;
  if (operators.length === 0) return <Card><EmptyState icon={<BarChart3 size={22} />} message="No transactions yet." /></Card>;
  return (
    <Table>
      <THead>
        <Th>Operator</Th><Th>Code</Th><Th>Total</Th><Th>Success</Th><Th>Sale Amount</Th><Th>Commission Paid</Th>
      </THead>
      <tbody>
        {operators.map((o) => (
          <Tr key={o.id}>
            <Td className="font-medium text-ink-900">{o.name}</Td>
            <Td className="font-mono text-xs text-ink-500">{o.code}</Td>
            <Td>{o.total}</Td>
            <Td className="text-emerald-600">{o.success}</Td>
            <Td>₹{o.amount.toFixed(2)}</Td>
            <Td>₹{o.commission.toFixed(2)}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function UserWiseTab() {
  const [users, setUsers] = useState<UserStat[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/recharge/user-stats").then((res) => {
      setUsers(res.data.users);
      setLoading(false);
    });
  }, []);
  if (loading) return null;
  if (users.length === 0) return <Card><EmptyState icon={<BarChart3 size={22} />} message="No downline transactions yet." /></Card>;
  return (
    <Table>
      <THead><Th>User</Th><Th>Phone</Th><Th>Total</Th><Th>Success</Th><Th>Sale Amount</Th></THead>
      <tbody>
        {users.map((u) => (
          <Tr key={u.id}>
            <Td className="font-medium text-ink-900">{u.name}</Td>
            <Td>{u.phone}</Td>
            <Td>{u.total}</Td>
            <Td className="text-emerald-600">{u.success}</Td>
            <Td>₹{u.amount.toFixed(2)}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function ApiWiseTab() {
  const [providers, setProviders] = useState<ProviderStat[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/recharge/provider-stats").then((res) => {
      setProviders(res.data.providers);
      setLoading(false);
    });
  }, []);
  if (loading) return null;
  if (providers.length === 0) return <Card><EmptyState icon={<BarChart3 size={22} />} message="No transactions yet." /></Card>;
  return (
    <Table>
      <THead><Th>Provider</Th><Th>Code</Th><Th>Total</Th><Th>Success</Th><Th>Failed</Th></THead>
      <tbody>
        {providers.map((p) => (
          <Tr key={p.id}>
            <Td className="font-medium text-ink-900">{p.name}</Td>
            <Td className="font-mono text-xs text-ink-500">{p.code}</Td>
            <Td>{p.total}</Td>
            <Td className="text-emerald-600">{p.success}</Td>
            <Td className="text-rose-600">{p.failed}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function IndividualTab() {
  const [search, setSearch] = useState("");
  const [user, setUser] = useState<{ id: string; name: string; phone: string; role: string; wallet: { balance: string } | null } | null>(null);
  const [stats, setStats] = useState<Record<string, { count: number; amount: string }> | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);

  async function runSearch() {
    if (!search.trim()) return;
    const res = await api.get("/recharge/individual-report", { params: { search } });
    setUser(res.data.user);
    setStats(res.data.stats);
    setTransactions(res.data.transactions);
    setSearched(true);
  }

  return (
    <div>
      <Card className="mb-4 flex items-center gap-3 p-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="Search by phone or name"
          className={`${inputClasses} max-w-xs`}
        />
        <button onClick={runSearch} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          <Search size={15} /> Search
        </button>
      </Card>

      {searched && !user && <Card><EmptyState icon={<Search size={22} />} message="No matching user found in your downline." /></Card>}

      {user && stats && (
        <>
          <div className="mb-4 flex flex-wrap gap-4">
            <div className="rounded-xl border border-ink-200 bg-white px-4 py-3">
              <div className="text-xs text-ink-500">{user.name} · {user.phone}</div>
              <div className="text-lg font-bold text-ink-900">₹{user.wallet?.balance ?? "0"} balance</div>
            </div>
            {Object.entries(stats).map(([status, s]) => (
              <div key={status} className="rounded-xl border border-ink-200 bg-white px-4 py-3">
                <div className="text-xs text-ink-500">{status}</div>
                <div className="text-lg font-bold text-ink-900">{s.count} · ₹{s.amount}</div>
              </div>
            ))}
          </div>
          <Table>
            <THead><Th>Date</Th><Th>Operator</Th><Th>Identifier</Th><Th>Amount</Th><Th>Status</Th></THead>
            <tbody>
              {transactions.map((t) => (
                <Tr key={t.id}>
                  <Td className="text-ink-500">{new Date(t.createdAt).toLocaleString()}</Td>
                  <Td>{t.operator.name}</Td>
                  <Td>{t.identifier}</Td>
                  <Td>₹{t.amount}</Td>
                  <Td><Badge>{t.status}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}

function RefundTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  useEffect(() => {
    api.get("/recharge/refund-report", { params: { from, to } }).then((res) => {
      setTransactions(res.data.transactions);
      setTotalAmount(res.data.totalAmount);
    });
  }, [from, to]);
  return (
    <div>
      <DateFilters from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <div className="mb-4 rounded-xl border border-ink-200 bg-white px-4 py-3 w-fit">
        <div className="text-xs text-ink-500">Total Refunded</div>
        <div className="text-lg font-bold text-rose-600">₹{totalAmount.toFixed(2)}</div>
      </div>
      {transactions.length === 0 ? (
        <Card><EmptyState icon={<BarChart3 size={22} />} message="No refunds in this range." /></Card>
      ) : (
        <Table>
          <THead><Th>Date</Th><Th>User</Th><Th>Operator</Th><Th>Identifier</Th><Th>Amount</Th></THead>
          <tbody>
            {transactions.map((t) => (
              <Tr key={t.id}>
                <Td className="text-ink-500">{new Date(t.createdAt).toLocaleString()}</Td>
                <Td>{t.user.name} ({t.user.phone})</Td>
                <Td>{t.operator.name}</Td>
                <Td>{t.identifier}</Td>
                <Td>₹{t.amount}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function OpeningClosingTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get("/wallet/opening-closing-report", { params: { from, to } }).then((res) => {
      setRows(res.data.rows);
      setLoading(false);
    });
  }, [from, to]);
  return (
    <div>
      <DateFilters from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {loading ? null : rows.length === 0 ? (
        <Card><EmptyState icon={<BarChart3 size={22} />} message="No users found." /></Card>
      ) : (
        <Table>
          <THead><Th>User</Th><Th>Phone</Th><Th>Role</Th><Th>Opening</Th><Th>Closing</Th></THead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium text-ink-900">{r.name}</Td>
                <Td>{r.phone}</Td>
                <Td className="text-ink-500">{r.role.replace("_", " ")}</Td>
                <Td>₹{r.opening}</Td>
                <Td>₹{r.closing}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function SecondarySalesTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  useEffect(() => {
    api.get("/users").then((res) => setUsers(res.data.users));
  }, []);
  useEffect(() => {
    api.get("/wallet/secondary-sales-report", { params: { from, to, userId } }).then((res) => {
      setTransfers(res.data.transfers);
      setTotalAmount(res.data.totalAmount);
    });
  }, [from, to, userId]);

  async function handleExport() {
    const res = await api.get("/wallet/secondary-sales-report/export", { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "secondary-sales.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${compactInputClasses} w-auto`} />
        <span className="text-ink-400">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${compactInputClasses} w-auto`} />
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className={`${compactInputClasses} w-auto`}>
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.phone})</option>
          ))}
        </select>
        <button
          onClick={handleExport}
          className="ml-auto rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
        >
          Export CSV
        </button>
      </Card>
      <div className="mb-4 rounded-xl border border-ink-200 bg-white px-4 py-3 w-fit">
        <div className="text-xs text-ink-500">Total Transferred (default: last 3 days)</div>
        <div className="text-lg font-bold text-ink-900">₹{totalAmount.toFixed(2)}</div>
      </div>
      {transfers.length === 0 ? (
        <Card><EmptyState icon={<BarChart3 size={22} />} message="No fund transfers in this range." /></Card>
      ) : (
        <Table>
          <THead><Th>Date</Th><Th>From</Th><Th>To</Th><Th>Amount</Th><Th>Mode</Th></THead>
          <tbody>
            {transfers.map((t) => (
              <Tr key={t.id}>
                <Td className="text-ink-500">{new Date(t.createdAt).toLocaleString()}</Td>
                <Td>{t.fromUser.name}</Td>
                <Td>{t.toUser.name}</Td>
                <Td>₹{t.amount}</Td>
                <Td className="text-ink-500">{t.paymentMode}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function RetailerActivityTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<"done" | "not_done">("done");
  const [saleDone, setSaleDone] = useState<any[]>([]);
  const [saleNotDone, setSaleNotDone] = useState<any[]>([]);
  useEffect(() => {
    api.get("/recharge/retailer-activity", { params: { from, to } }).then((res) => {
      setSaleDone(res.data.saleDone);
      setSaleNotDone(res.data.saleNotDone);
    });
  }, [from, to]);
  const rows = mode === "done" ? saleDone : saleNotDone;
  return (
    <div>
      <DateFilters from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <div className="mb-4 flex gap-2 border-b border-ink-200">
        <button onClick={() => setMode("done")} className={`border-b-2 px-3 py-2 text-sm font-semibold ${mode === "done" ? "border-brand-600 text-brand-600" : "border-transparent text-ink-500"}`}>
          Sale Done ({saleDone.length})
        </button>
        <button onClick={() => setMode("not_done")} className={`border-b-2 px-3 py-2 text-sm font-semibold ${mode === "not_done" ? "border-brand-600 text-brand-600" : "border-transparent text-ink-500"}`}>
          Sale Not Done ({saleNotDone.length})
        </button>
      </div>
      {rows.length === 0 ? (
        <Card><EmptyState icon={<BarChart3 size={22} />} message="No retailers in this bucket." /></Card>
      ) : (
        <Table>
          <THead>
            <Th>Retailer</Th><Th>Phone</Th>
            {mode === "done" && <><Th>Transactions</Th><Th>Amount</Th></>}
          </THead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium text-ink-900">{r.name}</Td>
                <Td>{r.phone}</Td>
                {mode === "done" && <><Td>{r.count}</Td><Td>₹{r.amount}</Td></>}
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function ProfitTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<{ successfulCount: number; totalVolume: number; totalCommissionPaid: number; totalRentPaid: number; netMargin: number } | null>(null);
  useEffect(() => {
    api.get("/recharge/profit-report", { params: { from, to } }).then((res) => setData(res.data));
  }, [from, to]);
  return (
    <div>
      <DateFilters from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <p className="mb-4 text-xs text-ink-500">
        Directional margin indicator: successful transaction volume minus commission paid to your downline minus provider rent debited. Real provider settlement cost isn't modeled here since providers are simulated.
      </p>
      {data && (
        <div className="flex flex-wrap gap-4">
          <div className="rounded-xl border border-ink-200 bg-white px-4 py-3">
            <div className="text-xs text-ink-500">Successful Transactions</div>
            <div className="text-lg font-bold text-ink-900">{data.successfulCount}</div>
          </div>
          <div className="rounded-xl border border-ink-200 bg-white px-4 py-3">
            <div className="text-xs text-ink-500">Total Volume</div>
            <div className="text-lg font-bold text-ink-900">₹{data.totalVolume.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-ink-200 bg-white px-4 py-3">
            <div className="text-xs text-ink-500">Commission Paid</div>
            <div className="text-lg font-bold text-rose-600">₹{data.totalCommissionPaid.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-ink-200 bg-white px-4 py-3">
            <div className="text-xs text-ink-500">Rent Paid</div>
            <div className="text-lg font-bold text-rose-600">₹{data.totalRentPaid.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
            <div className="text-xs text-brand-600">Net Margin</div>
            <div className="text-lg font-bold text-brand-700">₹{data.netMargin.toFixed(2)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReportsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [tab, setTab] = useState<Tab>("Operator-wise");
  const visibleTabs = TABS.filter((t) => t !== "Profit" || isAdmin);

  return (
    <div>
      <PageHeader title="Reports" subtitle="Operational and financial breakdowns across your downline." />

      <div className="mb-5 flex flex-wrap gap-2 border-b border-ink-200">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t ? "border-brand-600 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Operator-wise" && <OperatorWiseTab />}
      {tab === "User-wise" && <UserWiseTab />}
      {tab === "API-wise" && <ApiWiseTab />}
      {tab === "Individual" && <IndividualTab />}
      {tab === "Refund" && <RefundTab />}
      {tab === "Opening/Closing" && <OpeningClosingTab />}
      {tab === "Secondary Sales" && <SecondarySalesTab />}
      {tab === "Retailer Activity" && <RetailerActivityTab />}
      {tab === "Profit" && <ProfitTab />}
    </div>
  );
}
