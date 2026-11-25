import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui/PageHeader";
import { compactInputClasses } from "../components/ui/FormField";
import { TxnTable } from "../components/txn/TxnTable";
import { TxnActionModal, TxnResponseModal } from "../components/txn/TxnModals";
import { BulkActionBar } from "../components/txn/BulkActionBar";
import { inr, type AdminTxn, type OperatorOption, type ProviderOption } from "../components/txn/types";

const REFRESH_SECONDS = 7;
const STALE_MINUTES = 30;

// Pending rows older than STALE_MINUTES are highlighted red: those are the ones a provider
// has most likely dropped and that need a manual Action or Send to API.
function pendingTint(t: AdminTxn) {
  const ageMin = (Date.now() - new Date(t.createdAt).getTime()) / 60000;
  return ageMin > STALE_MINUTES ? "bg-row-failed" : "bg-row-success";
}

// Pendings is a manager tool; retailers who open the URL directly see their own history.
export function PendingPage() {
  const { user } = useAuth();
  if (user?.role === "RETAILER") return <Navigate to="/transactions?status=PENDING" replace />;
  return <PendingScreen isAdmin={user?.role === "ADMIN"} />;
}

function PendingScreen({ isAdmin }: { isAdmin: boolean }) {

  const [userQuery, setUserQuery] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [apiProviderId, setApiProviderId] = useState("");
  const [applied, setApplied] = useState({ user: "", operatorId: "", apiProviderId: "" });

  const [rows, setRows] = useState<AdminTxn[]>([]);
  const [totalAmount, setTotalAmount] = useState("0");
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [acting, setActing] = useState<AdminTxn | null>(null);
  const [viewing, setViewing] = useState<AdminTxn | null>(null);
  const [message, setMessage] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const modalOpen = useRef(false);
  modalOpen.current = Boolean(acting || viewing);

  useEffect(() => {
    api.get("/operators").then((res) => setOperators(res.data.operators)).catch(() => {});
    if (isAdmin) api.get("/providers").then((res) => setProviders(res.data.providers)).catch(() => {});
  }, [isAdmin]);

  const load = useCallback(() => {
    api
      .get("/admin/transactions", {
        params: { status: "PENDING", order: "asc", disablePaging: "1", ...Object.fromEntries(Object.entries(applied).filter(([, v]) => v)) },
      })
      .then((res) => {
        const list: AdminTxn[] = res.data.transactions;
        setRows(list);
        setTotalAmount(res.data.summary.PENDING.amount);
        // Keep ticks only on rows that are still pending.
        setSelected((s) => new Set([...s].filter((id) => list.some((t) => t.id === id))));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [applied]);

  useEffect(load, [load]);

  // "Refresh seconds: N" — counts down and reloads, paused while a dialog is open so
  // the row being worked on doesn't vanish underneath the operator.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      if (modalOpen.current) return;
      setCountdown((c) => {
        if (c <= 1) {
          load();
          return REFRESH_SECONDS;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  function search(e: FormEvent) {
    e.preventDefault();
    setApplied({ user: userQuery.trim(), operatorId, apiProviderId });
    setCountdown(REFRESH_SECONDS);
  }

  return (
    <div>
      <PageHeader title="Pendings" />

      <form onSubmit={search} className="mb-4 flex flex-wrap items-end gap-4 rounded-sm border border-ink-200 bg-white p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] font-bold">User</span>
          <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} className={`${compactInputClasses} w-52`} placeholder="Name or mobile" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12.5px] font-bold">Provider</span>
          <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className={`${compactInputClasses} w-52`}>
            <option value="">Select</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {isAdmin && (
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-bold">API</span>
            <select value={apiProviderId} onChange={(e) => setApiProviderId(e.target.value)} className={`${compactInputClasses} w-52`}>
              <option value="">ALL</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="rounded-[3px] bg-brand-500 px-3 py-[6px] text-[12.5px] text-white hover:bg-brand-600">
          Search
        </button>
        <label className="flex items-center gap-1.5 pb-1.5 text-[12.5px]">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Refresh seconds: {autoRefresh ? countdown : "off"}
        </label>
      </form>

      <div className="mb-2 rounded-sm border border-ink-200 bg-white px-4 py-3">
        <BulkActionBar
          selectedIds={[...selected]}
          providers={providers}
          canSendToApi={isAdmin}
          onDone={(m) => {
            setMessage(m);
            load();
          }}
        />
      </div>

      {message && (
        <div className="mb-2 flex items-center justify-between rounded-sm bg-row-success px-3 py-2 text-[12.5px] text-[#3c763d]">
          {message}
          <button onClick={() => setMessage("")}>✕</button>
        </div>
      )}

      <div className="mb-2 flex items-center justify-center">
        <span className="rounded-[3px] bg-[#f8ac59] px-2 py-[3px] text-[12px] font-bold text-white">
          P: {inr(totalAmount)} ({rows.length})
        </span>
      </div>

      {!loaded ? null : rows.length === 0 ? (
        <div className="rounded-sm border border-ink-200 bg-white py-12 text-center text-ink-500">Nothing pending — every transaction has settled.</div>
      ) : (
        <TxnTable
          transactions={rows}
          selected={selected}
          onToggle={(id) =>
            setSelected((s) => {
              const next = new Set(s);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onToggleAll={(checked) => setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set())}
          onAction={setActing}
          onResponse={setViewing}
          showApiBalance={isAdmin}
          rowTint={pendingTint}
        />
      )}

      {acting && <TxnActionModal txn={acting} onClose={() => setActing(null)} onDone={load} />}
      {viewing && <TxnResponseModal txn={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
