import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui/PageHeader";
import { PageLoader } from "../components/ui/PageLoader";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { inr } from "../components/txn/types";

interface StatBucket {
  count: number;
  amount: string;
}

interface ProviderStat {
  id: string;
  name: string;
  pendingAmount: number;
  saleAmount: number;
  walletBalance?: string;
  secondaryWalletBalance?: string;
}

interface UserStat {
  id: string;
  name: string;
  phone: string;
  amount: number;
  fundTransferred: number;
  balance: number;
}

interface PendingSummary {
  pendingKyc: number;
  openComplaints: number;
  pendingBalanceRequests: number;
  totalUsers: number;
  pendingGatewayOrders: number;
  pendingTransactions: number;
}

interface ExtendedSummary {
  generatedCommission: number;
  generatedSurcharge: number;
  apiOutlet: number;
  transferredBalance: number;
  reversedBalance: number;
  adminMainBalance: number;
  masterDistributorOutlet: number;
  distributorOutlet: number;
  retailerOutlet: number;
  totalOutletBalance: number;
  recharchesYesterday: { count: number; amount: number };
}

interface RecentTxn {
  id: string;
  identifier: string;
  amount: string;
  status: string;
  operator: { name: string };
  createdAt: string;
}

const STATUS_ROWS = [
  { key: "SUCCESS", label: "Total Success", tint: "bg-row-success" },
  { key: "FAILED", label: "Total Failed", tint: "bg-row-failed" },
  { key: "PENDING", label: "Total Pending", tint: "bg-row-pending" },
  { key: "REFUNDED", label: "Total Refund", tint: "bg-row-refund" },
] as const;

const link = "text-[#337ab7] hover:underline";

function StatusTable({ stats, totalUsers }: { stats: Record<string, StatBucket>; totalUsers?: number }) {
  return (
    <table className="mb-5 w-full border border-ink-200 text-[12.5px]">
      <tbody>
        {STATUS_ROWS.map((r) => (
          <tr key={r.key} className={`border-b border-white ${r.tint}`}>
            <td className="w-1/2 border-r border-white px-2.5 py-2 font-semibold text-ink-700">{r.label}</td>
            <td className="px-2.5 py-2">
              <Link to={`/transactions?status=${r.key}`} className={link}>
                [ {stats[r.key].count} ] {inr(stats[r.key].amount)}
              </Link>
            </td>
          </tr>
        ))}
        {totalUsers !== undefined && (
          <tr className="bg-row-success">
            <td className="border-r border-white px-2.5 py-2 font-semibold text-ink-700">Total Users</td>
            <td className="px-2.5 py-2">{totalUsers}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function CountRow({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Tr>
      <Td className="font-semibold">{label}</Td>
      <Td className="w-16 text-center">
        <Link to={to} className={link}>
          {value}
        </Link>
      </Td>
    </Tr>
  );
}

function ExtendedBlock() {
  const [data, setData] = useState<ExtendedSummary | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/dashboard/extended-summary");
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }

  const rows: [string, string][] = data
    ? [
        ["Generated Commission Main", inr(data.generatedCommission)],
        ["Generated Surcharge Main", inr(data.generatedSurcharge)],
        ["Transferred Balance Main", inr(data.transferredBalance)],
        ["Reversed Balance Main", inr(data.reversedBalance)],
        ["Admin Main Balance", inr(data.adminMainBalance)],
        ["API Outlet Main", inr(data.apiOutlet)],
        ["Master Distributor Outlet Main", inr(data.masterDistributorOutlet)],
        ["Distributor Outlet Main", inr(data.distributorOutlet)],
        ["Retailer Outlet Main", inr(data.retailerOutlet)],
        ["Total Outlet Balance Main", inr(data.totalOutletBalance)],
        ["Total Recharges Yesterday", `[ ${data.recharchesYesterday.count} ] ${inr(data.recharchesYesterday.amount)}`],
      ]
    : [
        ["Generated Commission Main", ""],
        ["Generated Surcharge Main", ""],
        ["Transferred Balance Main", ""],
        ["Reversed Balance Main", ""],
        ["Admin Main Balance", ""],
        ["API Outlet Main", ""],
        ["Master Distributor Outlet Main", ""],
        ["Distributor Outlet Main", ""],
        ["Retailer Outlet Main", ""],
        ["Total Outlet Balance Main", ""],
        ["Total Recharges Yesterday", ""],
      ];

  return (
    <Table>
      <tbody>
        <tr className="border-b border-ink-200">
          <td colSpan={2} className="py-2 text-center">
            <button onClick={load} disabled={loading} className={link}>
              {loading ? "Loading…" : data ? "Refresh below data" : "Click here to load below data"}
            </button>
          </td>
        </tr>
        {rows.map(([label, value]) => (
          <Tr key={label}>
            <Td className="font-semibold">{label}</Td>
            <Td className="w-40 text-right">{value}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function ApiTable({ providers }: { providers: ProviderStat[] }) {
  const sum = (f: (p: ProviderStat) => number) => providers.reduce((s, p) => s + f(p), 0);
  return (
    <Table className="mb-5">
      <THead>
        <Th>Api Name</Th>
        <Th className="text-right">Balance Wallet 1</Th>
        <Th className="text-right">Balance Wallet 2</Th>
        <Th className="text-right">Pendings</Th>
        <Th className="text-right">Sale</Th>
      </THead>
      <tbody>
        {providers.map((p) => (
          <Tr key={p.id}>
            <Td>{p.name}</Td>
            <Td className={`text-right ${Number(p.walletBalance ?? 0) < 0 ? "text-[#ed5565]" : ""}`}>{inr(p.walletBalance ?? 0)}</Td>
            <Td className="text-right">{inr(p.secondaryWalletBalance ?? 0)}</Td>
            <Td className="text-right">{inr(p.pendingAmount)}</Td>
            <Td className="text-right">{inr(p.saleAmount)}</Td>
          </Tr>
        ))}
        <tr className="border-t-2 border-ink-200 bg-ink-50 font-bold">
          <Td className="text-right">Total:</Td>
          <Td className="text-right">{inr(sum((p) => Number(p.walletBalance ?? 0)))}</Td>
          <Td className="text-right">{inr(sum((p) => Number(p.secondaryWalletBalance ?? 0)))}</Td>
          <Td className="text-right">{inr(sum((p) => p.pendingAmount))}</Td>
          <Td className="text-right">{inr(sum((p) => p.saleAmount))}</Td>
        </tr>
      </tbody>
    </Table>
  );
}

function UserTable({ users }: { users: UserStat[] }) {
  return (
    <Table>
      <THead>
        <Th>User</Th>
        <Th className="text-right">₹ Sales.</Th>
        <Th className="text-right">₹ Fund Transferred</Th>
        <Th className="text-right">₹ Balance</Th>
      </THead>
      <tbody>
        {users.length === 0 ? (
          <Tr>
            <Td colSpan={4} className="py-6 text-center text-ink-400">
              No users in your downline yet.
            </Td>
          </Tr>
        ) : (
          users.map((u) => (
            <Tr key={u.id}>
              <Td>
                {u.name.toUpperCase()}({u.phone})
              </Td>
              <Td className="text-right">{inr(u.amount)}</Td>
              <Td className="text-right">{inr(u.fundTransferred)}</Td>
              <Td className="text-right">{inr(u.balance)}</Td>
            </Tr>
          ))
        )}
      </tbody>
    </Table>
  );
}

function ManagerDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [stats, setStats] = useState<Record<string, StatBucket> | null>(null);
  const [summary, setSummary] = useState<PendingSummary | null>(null);
  const [providers, setProviders] = useState<ProviderStat[]>([]);
  const [users, setUsers] = useState<UserStat[]>([]);

  useEffect(() => {
    Promise.all([
      api.get("/recharge/stats"),
      api.get("/dashboard/pending-summary"),
      api.get("/recharge/provider-stats"),
      api.get("/recharge/user-stats"),
    ]).then(([statsRes, summaryRes, provRes, userRes]) => {
      setStats(statsRes.data.stats);
      setSummary(summaryRes.data);
      setProviders(provRes.data.providers);
      setUsers(userRes.data.users);
    });
  }, []);

  if (!stats || !summary) return <PageLoader />;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="min-w-0">
        <StatusTable stats={stats} totalUsers={summary.totalUsers} />
        <Table className="mb-5">
          <tbody>
            <CountRow label="Balance Requests" value={summary.pendingBalanceRequests} to="/balance-requests" />
            <CountRow label="Balance Requests Gateway" value={summary.pendingGatewayOrders} to="/balance-requests" />
            <CountRow label="Complaints" value={summary.openComplaints} to="/complaints" />
            <CountRow label="KYC Update Requests" value={summary.pendingKyc} to="/kyc" />
            <CountRow label="Pending Transactions" value={summary.pendingTransactions} to="/pending" />
          </tbody>
        </Table>
        <ExtendedBlock />
      </div>
      <div className="min-w-0">
        {isAdmin && <ApiTable providers={providers} />}
        <UserTable users={users} />
      </div>
    </div>
  );
}

function RetailerDashboard() {
  const [balance, setBalance] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, StatBucket> | null>(null);
  const [recent, setRecent] = useState<RecentTxn[]>([]);

  useEffect(() => {
    Promise.all([api.get("/wallet/balance"), api.get("/recharge/stats"), api.get("/recharge/history", { params: { pageSize: 10 } })]).then(
      ([b, s, h]) => {
        setBalance(b.data.balance);
        setStats(s.data.stats);
        setRecent(h.data.transactions);
      }
    );
  }, []);

  if (!stats) return <PageLoader />;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="min-w-0">
        <div className="mb-5 flex items-center justify-between rounded-sm border border-ink-200 bg-white px-4 py-3">
          <span className="font-semibold">Wallet Balance</span>
          <span className="text-[20px] font-semibold text-brand-600">{balance !== null ? inr(balance) : "…"}</span>
        </div>
        <StatusTable stats={stats} />
        <div className="flex flex-wrap gap-2">
          {[
            ["/recharge", "Recharge"],
            ["/bill-payment", "Bill Payment"],
            ["/dmt", "Money Transfer"],
            ["/balance-requests", "Request Balance"],
          ].map(([to, label]) => (
            <Link key={to} to={to} className="rounded-[3px] bg-brand-500 px-3 py-[7px] text-white hover:bg-brand-600">
              {label}
            </Link>
          ))}
        </div>
      </div>
      <Table className="min-w-0">
        <THead>
          <Th>Mobile / Number</Th>
          <Th>Operator</Th>
          <Th className="text-right">Amount</Th>
          <Th>Status</Th>
          <Th>Date</Th>
        </THead>
        <tbody>
          {recent.length === 0 ? (
            <Tr>
              <Td colSpan={5} className="py-6 text-center text-ink-400">
                No transactions yet.
              </Td>
            </Tr>
          ) : (
            recent.map((t) => (
              <Tr key={t.id}>
                <Td className="font-mono">{t.identifier}</Td>
                <Td>{t.operator.name}</Td>
                <Td className="text-right">{inr(t.amount)}</Td>
                <Td>
                  <Badge>{t.status}</Badge>
                </Td>
                <Td className="whitespace-nowrap text-ink-500">{new Date(t.createdAt).toLocaleString("en-IN")}</Td>
              </Tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const isManager = user?.role !== "RETAILER";
  return (
    <div>
      <PageHeader title={user?.role === "ADMIN" ? "Admin Dashboard" : "Dashboard"} />
      {isManager ? <ManagerDashboard /> : <RetailerDashboard />}
    </div>
  );
}
