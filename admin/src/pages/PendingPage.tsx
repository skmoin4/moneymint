import { useCallback, useEffect, useState } from "react";
import { Clock, CheckCircle2, XCircle, RefreshCw, Code2 } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { compactInputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

interface PendingTxn {
  id: string;
  type: string;
  identifier: string;
  amount: string;
  providerRefId: string | null;
  apiResponse: Record<string, unknown> | null;
  operator: { id: string; name: string };
  apiProvider: { id: string; name: string };
  user: { name: string; phone: string };
  createdAt: string;
}

interface Operator {
  id: string;
  name: string;
}

interface Provider {
  id: string;
  name: string;
}

function ageMinutes(createdAt: string) {
  return (Date.now() - new Date(createdAt).getTime()) / 60000;
}

function rowTone(createdAt: string) {
  const mins = ageMinutes(createdAt);
  if (mins > 30) return "bg-rose-50/60";
  if (mins > 10) return "bg-amber-50/60";
  return "bg-emerald-50/40";
}

export function PendingPage() {
  const [pending, setPending] = useState<PendingTxn[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [apiProviderId, setApiProviderId] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [viewing, setViewing] = useState<PendingTxn | null>(null);

  const load = useCallback(() => {
    api.get("/recharge/pending", { params: { operatorId, apiProviderId } }).then((res) => {
      setPending(res.data.transactions);
      setLoading(false);
    });
  }, [operatorId, apiProviderId]);

  const visible = pending.filter((t) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return t.user.name.toLowerCase().includes(q) || t.user.phone.includes(q);
  });
  const totalPending = visible.reduce((sum, t) => sum + Number(t.amount), 0);

  useEffect(() => {
    api.get("/operators").then((res) => setOperators(res.data.operators));
    api.get("/providers").then((res) => setProviders(res.data.providers)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 7000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  async function resolve(id: string, outcome: "SUCCESS" | "FAILED") {
    await api.post(`/recharge/${id}/resolve`, { outcome });
    load();
  }

  return (
    <div>
      <PageHeader
        title="Pending Transactions"
        subtitle="Transactions your providers never confirmed. Resolve them manually once you've verified the real outcome."
      />

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-500">
          User
          <input
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Name or phone"
            className={`${compactInputClasses} w-44`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-500">
          Provider
          <select value={apiProviderId} onChange={(e) => setApiProviderId(e.target.value)} className={`${compactInputClasses} w-auto`}>
            <option value="">All</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-500">
          API / Operator
          <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className={`${compactInputClasses} w-auto`}>
            <option value="">All</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>
        <button onClick={load} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          Search
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm font-medium text-ink-600">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          <RefreshCw size={14} className={autoRefresh ? "animate-spin" : ""} style={autoRefresh ? { animationDuration: "3s" } : {}} />
          Refresh seconds: 7
        </label>
      </Card>

      {!loading && (
        <div className="mb-4 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white">
          P: ₹{totalPending.toFixed(2)}
        </div>
      )}

      {loading ? null : visible.length === 0 ? (
        <Card>
          <EmptyState icon={<Clock size={22} />} message="Nothing pending. Everything has settled." />
        </Card>
      ) : (
        <Table>
          <THead>
            <Th>User</Th>
            <Th>Type</Th>
            <Th>Mobile / Consumer #</Th>
            <Th>Operator</Th>
            <Th>Provider</Th>
            <Th>Amount</Th>
            <Th>Age</Th>
            <Th>Action</Th>
          </THead>
          <tbody>
            {visible.map((t) => {
              const mins = ageMinutes(t.createdAt);
              return (
                <Tr key={t.id} className={rowTone(t.createdAt)}>
                  <Td className="font-medium text-ink-900">
                    {t.user.name}
                    <div className="text-xs text-ink-400">{t.user.phone}</div>
                  </Td>
                  <Td>{t.type}</Td>
                  <Td>{t.identifier}</Td>
                  <Td>{t.operator.name}</Td>
                  <Td className="text-ink-500">{t.apiProvider.name}</Td>
                  <Td>₹{t.amount}</Td>
                  <Td className="text-ink-500">{mins < 60 ? `${Math.floor(mins)}m` : `${Math.floor(mins / 60)}h ${Math.floor(mins % 60)}m`}</Td>
                  <Td>
                    <div className="flex gap-2">
                      <button
                        onClick={() => resolve(t.id, "SUCCESS")}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                        title="Mark Success"
                      >
                        <CheckCircle2 size={16} />
                      </button>
                      <button
                        onClick={() => resolve(t.id, "FAILED")}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
                        title="Mark Failed (refunds the user)"
                      >
                        <XCircle size={16} />
                      </button>
                      <button
                        onClick={() => setViewing(t)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-500 hover:bg-ink-200"
                        title="View raw provider response"
                      >
                        <Code2 size={16} />
                      </button>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {viewing && (
        <Modal title={`Provider Response — ${viewing.identifier}`} onClose={() => setViewing(null)}>
          <div className="mb-3 text-xs text-ink-500">
            Provider Ref: <span className="font-mono text-ink-700">{viewing.providerRefId ?? "—"}</span>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-ink-50 p-4 text-xs text-ink-700">
            {viewing.apiResponse ? JSON.stringify(viewing.apiResponse, null, 2) : "No response recorded yet — the provider hasn't answered."}
          </pre>
        </Modal>
      )}
    </div>
  );
}
