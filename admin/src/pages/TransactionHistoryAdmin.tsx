import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui/PageHeader";
import { PageLoader } from "../components/ui/PageLoader";
import { Pagination } from "../components/ui/Pagination";
import { compactInputClasses } from "../components/ui/FormField";
import { TxnTable } from "../components/txn/TxnTable";
import { TxnActionModal, TxnResponseModal } from "../components/txn/TxnModals";
import { BulkActionBar } from "../components/txn/BulkActionBar";
import { StatusChips } from "../components/txn/StatusChips";
import type { AdminTxn, OperatorOption, ProviderOption, StatusSummary } from "../components/txn/types";

const PAGE_SIZE = 50;

interface Filters {
  from: string;
  to: string;
  mobile: string;
  user: string;
  txnId: string;
  opRefId: string;
  status: string;
  type: string;
  operatorId: string;
  apiProviderId: string;
  source: string;
  amount: string;
  parentUser: string;
  blankOpTxn: boolean;
  blankResponse: boolean;
  onlyComplaints: boolean;
  disablePaging: boolean;
}

const EMPTY: Filters = {
  from: "",
  to: "",
  mobile: "",
  user: "",
  txnId: "",
  opRefId: "",
  status: "",
  type: "",
  operatorId: "",
  apiProviderId: "",
  source: "",
  amount: "",
  parentUser: "",
  blankOpTxn: false,
  blankResponse: false,
  onlyComplaints: false,
  disablePaging: false,
};

function toParams(f: Filters) {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) {
    if (typeof v === "boolean") {
      if (v) params[k] = "1";
    } else if (v.trim()) {
      params[k] = v.trim();
    }
  }
  return params;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[12.5px] font-bold text-ink-700">{label}</span>
      {children}
    </label>
  );
}

const input = `${compactInputClasses} w-full`;

export function TransactionHistoryAdmin() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [searchParams] = useSearchParams();

  const urlFilters = useMemo<Filters>(
    () => ({
      ...EMPTY,
      mobile: searchParams.get("mobile") ?? searchParams.get("search") ?? "",
      status: searchParams.get("status") ?? "",
    }),
    [searchParams]
  );

  const [draft, setDraft] = useState<Filters>(urlFilters);
  const [applied, setApplied] = useState<Filters>(urlFilters);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminTxn[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<StatusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [acting, setActing] = useState<AdminTxn | null>(null);
  const [viewing, setViewing] = useState<AdminTxn | null>(null);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);

  // Sidebar links (e.g. Refunds → ?status=REFUNDED) and the top-bar number search
  // re-apply filters while this page is already open.
  useEffect(() => {
    setDraft(urlFilters);
    setApplied(urlFilters);
    setPage(1);
  }, [urlFilters]);

  useEffect(() => {
    api.get("/operators").then((res) => setOperators(res.data.operators)).catch(() => {});
    if (isAdmin) api.get("/providers").then((res) => setProviders(res.data.providers)).catch(() => {});
  }, [isAdmin]);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/admin/transactions", { params: { ...toParams(applied), page, pageSize: PAGE_SIZE } })
      .then((res) => {
        setRows(res.data.transactions);
        setTotal(res.data.total);
        setSummary(res.data.summary);
        setSelected(new Set());
      })
      .finally(() => setLoading(false));
  }, [applied, page]);

  useEffect(load, [load]);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function search(e?: FormEvent) {
    e?.preventDefault();
    setPage(1);
    setApplied({ ...draft });
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await api.get("/admin/transactions/export", { params: toParams(applied), responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "transaction-history.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const types = Array.from(new Set(operators.map((o) => o.type))).sort();

  return (
    <div>
      <PageHeader title="Transaction History" />

      <form onSubmit={search} className="mb-4 rounded-sm border border-ink-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Field label="Date Range">
            <div className="flex items-center gap-1">
              <input type="datetime-local" value={draft.from} onChange={(e) => set("from", e.target.value)} className={`${input} px-1.5 text-[12px]`} aria-label="From" />
            </div>
          </Field>
          <Field label="To">
            <input type="datetime-local" value={draft.to} onChange={(e) => set("to", e.target.value)} className={`${input} px-1.5 text-[12px]`} />
          </Field>
          <Field label="Mobile No.">
            <input value={draft.mobile} onChange={(e) => set("mobile", e.target.value)} className={input} />
          </Field>
          <Field label="User">
            <input value={draft.user} onChange={(e) => set("user", e.target.value)} className={input} placeholder="Name or mobile" />
          </Field>
          <Field label="TxnId">
            <input value={draft.txnId} onChange={(e) => set("txnId", e.target.value)} className={input} />
          </Field>
          <Field label="OpRefId">
            <input value={draft.opRefId} onChange={(e) => set("opRefId", e.target.value)} className={input} />
          </Field>

          <Field label="Status">
            <select value={draft.status} onChange={(e) => set("status", e.target.value)} className={input}>
              <option value="">ALL</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILED">FAILED</option>
              <option value="PENDING">PENDING</option>
              <option value="REFUNDED">REFUNDED</option>
            </select>
          </Field>
          <Field label="Provider Type">
            <select value={draft.type} onChange={(e) => set("type", e.target.value)} className={input}>
              <option value="">Select</option>
              <option value="RECHARGE">Recharge</option>
              <option value="BBPS">Bill Payment (BBPS)</option>
              <option value="DMT">Money Transfer (DMT)</option>
              <option value="AEPS">AEPS</option>
            </select>
          </Field>
          <Field label="Provider">
            <select value={draft.operatorId} onChange={(e) => set("operatorId", e.target.value)} className={input}>
              <option value="">Select</option>
              {types.map((t) => (
                <optgroup key={t} label={t}>
                  {operators
                    .filter((o) => o.type === t)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Field>
          {isAdmin ? (
            <Field label="API">
              <select value={draft.apiProviderId} onChange={(e) => set("apiProviderId", e.target.value)} className={input}>
                <option value="">ALL</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="hidden xl:block" />
          )}
          <Field label="Source">
            <select value={draft.source} onChange={(e) => set("source", e.target.value)} className={input}>
              <option value="">ALL</option>
              <option value="APP">App</option>
              <option value="WEB">Web</option>
              <option value="API">API</option>
              <option value="MANUAL">Manual</option>
              <option value="QUEUE">Q Recharge</option>
            </select>
          </Field>
          <Field label="Amount">
            <input inputMode="decimal" value={draft.amount} onChange={(e) => set("amount", e.target.value)} className={input} />
          </Field>

          <Field label="Parent User">
            <input value={draft.parentUser} onChange={(e) => set("parentUser", e.target.value)} className={input} placeholder="Name or mobile" />
          </Field>
          <div className="flex flex-col justify-end gap-0.5 text-[12.5px] sm:col-span-1 lg:col-span-2">
            {(
              [
                ["blankOpTxn", "Show only blank Op Txn"],
                ["blankResponse", "Show only blank Response"],
                ["onlyComplaints", "Show only Complaints"],
                ["disablePaging", "Disable Paging"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5">
                <input type="checkbox" checked={draft[key]} onChange={(e) => set(key, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
          <div className="flex items-end gap-1.5">
            <button type="submit" className="rounded-[3px] bg-brand-500 px-3 py-[6px] text-[12.5px] text-white hover:bg-brand-600">
              Search
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={exporting}
              className="rounded-[3px] bg-brand-500 px-3 py-[6px] text-[12.5px] text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {exporting ? "Exporting…" : "Export"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(EMPTY);
                setApplied(EMPTY);
                setPage(1);
              }}
              className="rounded-[3px] border border-ink-300 bg-white px-3 py-[5px] text-[12.5px] text-ink-700 hover:bg-ink-50"
            >
              Reset
            </button>
          </div>
        </div>
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
          <button onClick={() => setMessage("")} className="text-[#3c763d]">
            ✕
          </button>
        </div>
      )}

      {summary && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <StatusChips
            summary={summary}
            onPick={(status) => {
              const next = { ...applied, status };
              setDraft(next);
              setApplied(next);
              setPage(1);
            }}
          />
          <span className="text-[12px] text-ink-500">{total} transaction(s)</span>
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <div className="rounded-sm border border-ink-200 bg-white py-12 text-center text-ink-500">No transactions match these filters.</div>
      ) : (
        <>
          <TxnTable
            transactions={rows}
            offset={applied.disablePaging ? 0 : (page - 1) * PAGE_SIZE}
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
          />
          {!applied.disablePaging && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />}
        </>
      )}

      {acting && <TxnActionModal txn={acting} onClose={() => setActing(null)} onDone={load} />}
      {viewing && <TxnResponseModal txn={viewing} onClose={() => setViewing(null)} showLogs={isAdmin} />}
    </div>
  );
}
