import { useEffect, useState, type ReactNode } from "react";
import { Wallet, CheckCircle2, XCircle, Clock, RotateCcw, Inbox, Server, ChevronRight, ChevronDown, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui/PageHeader";
import { PageLoader } from "../components/ui/PageLoader";
import { EmptyState } from "../components/ui/EmptyState";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

interface Transaction {
  id: string;
  identifier: string;
  amount: string;
  status: string;
  operator: { name: string };
  createdAt: string;
}

interface StatBucket {
  count: number;
  amount: string;
}

interface ProviderStat {
  id: string;
  name: string;
  code: string;
  total: number;
  success: number;
  failed: number;
  pendingAmount: number;
  saleAmount: number;
  walletBalance?: string;
  secondaryWalletBalance?: string;
  secondaryWalletLabel?: string;
}

interface UserStat {
  id: string;
  name: string;
  phone: string;
  total: number;
  success: number;
  amount: number;
  fundTransferred: number;
  balance: number;
}

interface PendingSummary {
  pendingKyc: number;
  openComplaints: number;
  pendingBalanceRequests: number;
  totalUsers: number;
}

interface ExtendedSummary {
  generatedCommission: number;
  transferredBalance: number;
  reversedBalance: number;
  adminMainBalance: number;
  masterDistributorOutlet: number;
  distributorOutlet: number;
  retailerOutlet: number;
  totalOutletBalance: number;
  recharchesYesterday: { count: number; amount: number };
}

function LedgerRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-50 px-4 py-2 text-sm last:border-0">
      <span className="text-ink-600">{label}</span>
      <span className="font-semibold text-ink-900">{value}</span>
    </div>
  );
}

function StatRow({
  label,
  count,
  amount,
  icon,
  tone,
}: {
  label: string;
  count: number;
  amount: string;
  icon: ReactNode;
  tone: "emerald" | "rose" | "amber" | "brand";
}) {
  const TONE_CLASSES: Record<typeof tone, string> = {
    emerald: "bg-emerald-50 text-emerald-800",
    rose: "bg-rose-50 text-rose-800",
    amber: "bg-amber-50 text-amber-800",
    brand: "bg-brand-50 text-brand-800",
  };
  return (
    <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm font-medium ${TONE_CLASSES[tone]}`}>
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span>
        [{count}] ₹{amount}
      </span>
    </div>
  );
}

function AttentionRow({ to, label, count }: { to: string; label: string; count: number }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-lg px-4 py-2 text-sm text-ink-700 hover:bg-ink-50">
      <span>{label}</span>
      <span className="flex items-center gap-1 font-semibold text-brand-600">
        {count}
        <ChevronRight size={14} />
      </span>
    </Link>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const isManager = user?.role !== "RETAILER";

  const [balance, setBalance] = useState<string | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<Record<string, StatBucket> | null>(null);
  const [providers, setProviders] = useState<ProviderStat[]>([]);
  const [topUsers, setTopUsers] = useState<UserStat[]>([]);
  const [pendingSummary, setPendingSummary] = useState<PendingSummary | null>(null);
  const [extended, setExtended] = useState<ExtendedSummary | null>(null);
  const [extendedOpen, setExtendedOpen] = useState(false);
  const [extendedLoading, setExtendedLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadExtended() {
    if (extended) {
      setExtendedOpen((o) => !o);
      return;
    }
    setExtendedLoading(true);
    const res = await api.get("/dashboard/extended-summary");
    setExtended(res.data);
    setExtendedOpen(true);
    setExtendedLoading(false);
  }

  useEffect(() => {
    async function load() {
      const calls = [
        api.get("/wallet/balance"),
        api.get("/recharge/history", { params: { pageSize: 5 } }),
        api.get("/recharge/stats"),
      ];
      const [balanceRes, historyRes, statsRes] = await Promise.all(calls);
      setBalance(balanceRes.data.balance);
      setRecent(historyRes.data.transactions);
      setStats(statsRes.data.stats);

      if (isManager) {
        const [providerRes, userRes, pendingRes] = await Promise.all([
          api.get("/recharge/provider-stats"),
          api.get("/recharge/user-stats"),
          api.get("/dashboard/pending-summary"),
        ]);
        setProviders(providerRes.data.providers);
        setTopUsers(userRes.data.users.slice(0, 5));
        setPendingSummary(pendingRes.data);
      }
      setLoading(false);
    }
    load();
  }, [isManager]);

  if (loading || !stats) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={
          isManager
            ? "Platform-wide overview across your entire downline."
            : "Overview of your wallet and recent activity."
        }
      />

      <div className={isManager ? "grid gap-6 lg:grid-cols-[400px_1fr]" : ""}>
        <div className="flex flex-col gap-5">
          <Card className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Wallet size={18} />
            </div>
            <div>
              <div className="text-xs text-ink-500">Wallet Balance</div>
              <div className="text-lg font-bold text-ink-900">₹{balance}</div>
            </div>
          </Card>

          <Card className="flex flex-col gap-1.5 p-3">
            <StatRow label="Total Success" count={stats.SUCCESS.count} amount={stats.SUCCESS.amount} icon={<CheckCircle2 size={15} />} tone="emerald" />
            <StatRow label="Total Failed" count={stats.FAILED.count} amount={stats.FAILED.amount} icon={<XCircle size={15} />} tone="rose" />
            <StatRow label="Total Pending" count={stats.PENDING.count} amount={stats.PENDING.amount} icon={<Clock size={15} />} tone="amber" />
            <StatRow label="Total Refund" count={stats.REFUNDED.count} amount={stats.REFUNDED.amount} icon={<RotateCcw size={15} />} tone="brand" />
            {isManager && pendingSummary && (
              <div className="flex items-center justify-between px-4 py-2.5 text-sm font-medium text-ink-700">
                <span className="flex items-center gap-2">
                  <Users size={15} />
                  Total Users
                </span>
                <span>{pendingSummary.totalUsers}</span>
              </div>
            )}
          </Card>

          {isManager && pendingSummary && (
            <Card className="flex flex-col gap-1 p-2">
              <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                Needs Attention
              </div>
              <AttentionRow to="/kyc" label="Pending KYC" count={pendingSummary.pendingKyc} />
              <AttentionRow to="/complaints" label="Open Complaints" count={pendingSummary.openComplaints} />
              <AttentionRow to="/balance-requests" label="Pending Balance Requests" count={pendingSummary.pendingBalanceRequests} />
            </Card>
          )}

          {isManager && (
            <Card className="p-0">
              <button
                onClick={loadExtended}
                className="flex w-full items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
              >
                {extendedLoading ? "Loading..." : extendedOpen ? "Hide detailed breakdown" : "Click here to load below data"}
                <ChevronDown size={14} className={`transition-transform ${extendedOpen ? "rotate-180" : ""}`} />
              </button>
              {extendedOpen && extended && (
                <div className="border-t border-ink-100">
                  <LedgerRow label="Generated Commission" value={`₹${extended.generatedCommission.toFixed(2)}`} />
                  <LedgerRow label="Transferred Balance" value={`₹${extended.transferredBalance.toFixed(2)}`} />
                  <LedgerRow label="Reversed Balance (Refunds)" value={`₹${extended.reversedBalance.toFixed(2)}`} />
                  <LedgerRow label="Admin Main Balance" value={`₹${extended.adminMainBalance.toFixed(2)}`} />
                  <LedgerRow label="Master Distributor Outlet" value={`₹${extended.masterDistributorOutlet.toFixed(2)}`} />
                  <LedgerRow label="Distributor Outlet" value={`₹${extended.distributorOutlet.toFixed(2)}`} />
                  <LedgerRow label="Retailer Outlet" value={`₹${extended.retailerOutlet.toFixed(2)}`} />
                  <LedgerRow label="Total Outlet Balance" value={`₹${extended.totalOutletBalance.toFixed(2)}`} />
                  <LedgerRow
                    label="Total Recharges Yesterday"
                    value={`${extended.recharchesYesterday.count} (₹${extended.recharchesYesterday.amount.toFixed(2)})`}
                  />
                </div>
              )}
            </Card>
          )}
        </div>

        {isManager && (
          <div className="flex flex-col gap-8">
            {providers.length > 0 && (
              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
                  Provider Volume
                </h2>
                <Table>
                  <THead>
                    <Th>Provider</Th>
                    {user?.role === "ADMIN" && (
                      <>
                        <Th>Wallet 1</Th>
                        <Th>Wallet 2</Th>
                      </>
                    )}
                    <Th>Pendings</Th>
                    <Th>Sale</Th>
                    <Th>Success</Th>
                    <Th>Failed</Th>
                  </THead>
                  <tbody>
                    {providers.map((p) => (
                      <Tr key={p.id}>
                        <Td className="flex items-center gap-2 font-medium text-ink-900">
                          <Server size={14} className="text-ink-400" /> {p.name}
                        </Td>
                        {user?.role === "ADMIN" && (
                          <>
                            <Td className={Number(p.walletBalance ?? 0) <= 0 ? "text-rose-600" : ""}>
                              ₹{p.walletBalance ?? "0"}
                            </Td>
                            <Td className="text-ink-500" title={p.secondaryWalletLabel}>₹{p.secondaryWalletBalance ?? "0"}</Td>
                          </>
                        )}
                        <Td className="text-amber-600">₹{p.pendingAmount.toFixed(2)}</Td>
                        <Td>₹{p.saleAmount.toFixed(2)}</Td>
                        <Td className="text-emerald-600">{p.success}</Td>
                        <Td className="text-rose-600">{p.failed}</Td>
                      </Tr>
                    ))}
                    <Tr>
                      <Td className="font-bold text-ink-900">Total</Td>
                      {user?.role === "ADMIN" && (
                        <>
                          <Td className="font-bold text-ink-900">
                            ₹{providers.reduce((s, p) => s + Number(p.walletBalance ?? 0), 0).toFixed(2)}
                          </Td>
                          <Td className="font-bold text-ink-900">
                            ₹{providers.reduce((s, p) => s + Number(p.secondaryWalletBalance ?? 0), 0).toFixed(2)}
                          </Td>
                        </>
                      )}
                      <Td className="font-bold text-amber-700">₹{providers.reduce((s, p) => s + p.pendingAmount, 0).toFixed(2)}</Td>
                      <Td className="font-bold text-ink-900">₹{providers.reduce((s, p) => s + p.saleAmount, 0).toFixed(2)}</Td>
                      <Td className="font-bold text-emerald-700">{providers.reduce((s, p) => s + p.success, 0)}</Td>
                      <Td className="font-bold text-rose-700">{providers.reduce((s, p) => s + p.failed, 0)}</Td>
                    </Tr>
                  </tbody>
                </Table>
              </div>
            )}

            {topUsers.length > 0 && (
              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
                  Top Users by Sale Amount
                </h2>
                <Table>
                  <THead>
                    <Th>User</Th>
                    <Th>Phone</Th>
                    <Th>Total</Th>
                    <Th>Success</Th>
                    <Th>Sale Amount</Th>
                    <Th>Fund Transferred</Th>
                    <Th>Balance</Th>
                  </THead>
                  <tbody>
                    {topUsers.map((u) => (
                      <Tr key={u.id}>
                        <Td className="font-medium text-ink-900">{u.name}</Td>
                        <Td>{u.phone}</Td>
                        <Td>{u.total}</Td>
                        <Td className="text-emerald-600">{u.success}</Td>
                        <Td>₹{u.amount.toFixed(2)}</Td>
                        <Td>₹{u.fundTransferred.toFixed(2)}</Td>
                        <Td className="font-medium text-ink-900">₹{u.balance.toFixed(2)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-ink-500">
        Recent Transactions
      </h2>

      {recent.length === 0 ? (
        <Card>
          <EmptyState icon={<Inbox size={22} />} message="No transactions yet." />
        </Card>
      ) : (
        <Table>
          <THead>
            <Th>Mobile / Consumer #</Th>
            <Th>Operator</Th>
            <Th>Amount</Th>
            <Th>Status</Th>
            <Th>Date</Th>
          </THead>
          <tbody>
            {recent.map((t) => (
              <Tr key={t.id}>
                <Td className="font-medium text-ink-900">{t.identifier}</Td>
                <Td>{t.operator.name}</Td>
                <Td>₹{t.amount}</Td>
                <Td>
                  <Badge>{t.status}</Badge>
                </Td>
                <Td className="text-ink-500">{new Date(t.createdAt).toLocaleString()}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
