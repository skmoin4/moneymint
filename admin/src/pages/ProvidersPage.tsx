import { type FormEvent, useEffect, useState } from "react";
import { Server, Plug, ReceiptText, History, Wallet, X } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField, inputClasses, compactInputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

interface Provider {
  id: string;
  name: string;
  code: string;
  providerType: string;
  baseUrl: string;
  isActive: boolean;
  rentAmount: string;
  smsAlertOnSuccess: boolean;
  smsAlertOnFailure: boolean;
  retryCount: number;
  gstPercent: string;
  walletBalance: string;
  secondaryWalletBalance: string;
  secondaryWalletLabel: string;
}

interface WalletEntry {
  id: string;
  walletSlot: number;
  type: "CREDIT" | "DEBIT";
  amount: string;
  balanceAfter: string;
  description: string | null;
  createdAt: string;
}

interface RentEntry {
  id: string;
  amount: string;
  balanceAfter: string;
  description: string | null;
  createdAt: string;
  provider: { name: string } | null;
}

interface RentUpdateLog {
  id: string;
  details: string | null;
  createdAt: string;
  user: { name: string; phone: string } | null;
}

const PROVIDER_TYPES = ["RECHARGE", "AEPS", "DMT", "BBPS"];

export function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [rentEntries, setRentEntries] = useState<RentEntry[]>([]);
  const [rentUpdateLogs, setRentUpdateLogs] = useState<RentUpdateLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [providerType, setProviderType] = useState(PROVIDER_TYPES[0]);
  const [baseUrl, setBaseUrl] = useState("https://");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [rentAmount, setRentAmount] = useState("0");
  const [gstPercent, setGstPercent] = useState("0");
  const [retryCount, setRetryCount] = useState("1");
  const [smsAlertOnSuccess, setSmsAlertOnSuccess] = useState(true);
  const [smsAlertOnFailure, setSmsAlertOnFailure] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [topupFor, setTopupFor] = useState<Provider | null>(null);
  const [topupSlot, setTopupSlot] = useState<1 | 2>(1);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const [topupError, setTopupError] = useState("");

  const [historyFor, setHistoryFor] = useState<Provider | null>(null);
  const [walletHistory, setWalletHistory] = useState<WalletEntry[]>([]);

  function load() {
    setLoading(true);
    Promise.all([
      api.get("/providers"),
      api.get("/providers/rent-report"),
      api.get("/providers/rent-update-report"),
    ]).then(([provRes, rentRes, updateRes]) => {
      setProviders(provRes.data.providers);
      setRentEntries(rentRes.data.entries);
      setRentUpdateLogs(updateRes.data.logs);
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/providers", {
        name,
        code,
        providerType,
        baseUrl,
        apiKey,
        apiSecret,
        rentAmount: Number(rentAmount) || 0,
        gstPercent: Number(gstPercent) || 0,
        retryCount: Number(retryCount) || 1,
        smsAlertOnSuccess,
        smsAlertOnFailure,
      });
      setName("");
      setCode("");
      setBaseUrl("https://");
      setApiKey("");
      setApiSecret("");
      setRentAmount("0");
      setGstPercent("0");
      setRetryCount("1");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not create provider.");
    } finally {
      setSubmitting(false);
    }
  }

  async function patchProvider(p: Provider, data: Partial<Provider>) {
    await api.patch(`/providers/${p.id}`, data);
    load();
  }

  async function debitRent(p: Provider) {
    await api.post(`/providers/${p.id}/debit-rent`, {});
    load();
  }

  function openTopup(p: Provider) {
    setTopupFor(p);
    setTopupSlot(1);
    setTopupAmount("");
    setTopupError("");
  }

  async function handleTopup(e: FormEvent) {
    e.preventDefault();
    if (!topupFor) return;
    setTopupError("");
    setTopupSubmitting(true);
    try {
      await api.post(`/providers/${topupFor.id}/topup-wallet`, {
        walletSlot: topupSlot,
        amount: Number(topupAmount),
      });
      setTopupFor(null);
      load();
    } catch (err: any) {
      setTopupError(err.response?.data?.error || "Could not fund wallet.");
    } finally {
      setTopupSubmitting(false);
    }
  }

  async function openHistory(p: Provider) {
    if (historyFor?.id === p.id) {
      setHistoryFor(null);
      return;
    }
    const res = await api.get(`/providers/${p.id}/wallet-report`);
    setWalletHistory(res.data.entries);
    setHistoryFor(p);
  }

  return (
    <div>
      <PageHeader
        title="API Providers"
        subtitle="Upstream vendors that process recharge, AEPS, DMT, and BBPS requests."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Plug size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900">Add Provider</div>
              <div className="text-xs text-ink-500">Register a new upstream vendor</div>
            </div>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Basic Info</div>
            <FormField label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} required />
            </FormField>
            <FormField label="Code" hint="Unique short code, e.g. ROBO1">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={inputClasses} required />
            </FormField>
            <FormField label="Type">
              <select value={providerType} onChange={(e) => setProviderType(e.target.value)} className={inputClasses}>
                {PROVIDER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Base URL">
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={inputClasses} required />
            </FormField>

            <div className="mt-1 border-t border-ink-100 pt-4 text-[11px] font-bold uppercase tracking-wide text-ink-400">
              Credentials
            </div>
            <FormField label="API Key">
              <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className={inputClasses} required />
            </FormField>
            <FormField label="API Secret">
              <input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                className={inputClasses}
                required
              />
            </FormField>

            <div className="mt-1 border-t border-ink-100 pt-4 text-[11px] font-bold uppercase tracking-wide text-ink-400">
              Rent &amp; Billing
            </div>
            <FormField label="Monthly Rent (₹)" hint="Subscription cost deducted from your wallet">
              <input
                type="number"
                min="0"
                value={rentAmount}
                onChange={(e) => setRentAmount(e.target.value)}
                className={inputClasses}
              />
            </FormField>
            <FormField label="GST on Rent (%)" hint="Added on top when rent is debited">
              <input
                type="number"
                min="0"
                max="100"
                value={gstPercent}
                onChange={(e) => setGstPercent(e.target.value)}
                className={inputClasses}
              />
            </FormField>

            <div className="mt-1 border-t border-ink-100 pt-4 text-[11px] font-bold uppercase tracking-wide text-ink-400">
              Reliability &amp; Alerts
            </div>
            <FormField label="Retry Count" hint="Attempts on this provider before failing over">
              <input
                type="number"
                min="1"
                max="5"
                value={retryCount}
                onChange={(e) => setRetryCount(e.target.value)}
                className={inputClasses}
              />
            </FormField>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={smsAlertOnSuccess} onChange={(e) => setSmsAlertOnSuccess(e.target.checked)} />
              SMS alert on success
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={smsAlertOnFailure} onChange={(e) => setSmsAlertOnFailure(e.target.checked)} />
              SMS alert on failure
            </label>

            {error && <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}

            <Button type="submit" loading={submitting} className="mt-1">
              {submitting ? "Adding..." : "Add Provider"}
            </Button>
          </form>
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Registered Providers
          </h2>
          {loading ? null : providers.length === 0 ? (
            <Card>
              <EmptyState icon={<Server size={22} />} message="No providers registered yet." />
            </Card>
          ) : (
            <Table>
              <THead>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Type</Th>
                <Th>Wallet 1</Th>
                <Th>Wallet 2</Th>
                <Th>Rent</Th>
                <Th>GST%</Th>
                <Th>Retries</Th>
                <Th>SMS S/F</Th>
                <Th>Status</Th>
                <Th />
              </THead>
              <tbody>
                {providers.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium text-ink-900">{p.name}</Td>
                    <Td className="font-mono text-xs text-ink-500">{p.code}</Td>
                    <Td className="text-ink-500">{p.providerType}</Td>
                    <Td className={Number(p.walletBalance) <= 0 ? "font-medium text-rose-600" : "font-medium text-ink-900"}>
                      ₹{p.walletBalance}
                    </Td>
                    <Td className="text-ink-500" title={p.secondaryWalletLabel}>₹{p.secondaryWalletBalance}</Td>
                    <Td>₹{p.rentAmount}</Td>
                    <Td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={p.gstPercent}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (!isNaN(v) && v !== Number(p.gstPercent)) patchProvider(p, { gstPercent: v as any });
                        }}
                        className="w-16 rounded border border-ink-200 px-1.5 py-1 text-xs"
                      />
                    </Td>
                    <Td>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        defaultValue={p.retryCount}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (!isNaN(v) && v !== p.retryCount) patchProvider(p, { retryCount: v as any });
                        }}
                        className="w-14 rounded border border-ink-200 px-1.5 py-1 text-xs"
                      />
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <button
                          onClick={() => patchProvider(p, { smsAlertOnSuccess: !p.smsAlertOnSuccess })}
                          title="SMS on success"
                          className={`h-5 w-5 rounded text-[10px] font-bold ${p.smsAlertOnSuccess ? "bg-emerald-100 text-emerald-700" : "bg-ink-100 text-ink-400"}`}
                        >
                          S
                        </button>
                        <button
                          onClick={() => patchProvider(p, { smsAlertOnFailure: !p.smsAlertOnFailure })}
                          title="SMS on failure"
                          className={`h-5 w-5 rounded text-[10px] font-bold ${p.smsAlertOnFailure ? "bg-emerald-100 text-emerald-700" : "bg-ink-100 text-ink-400"}`}
                        >
                          F
                        </button>
                      </div>
                    </Td>
                    <Td>
                      <button
                        onClick={() => patchProvider(p, { isActive: !p.isActive })}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${
                          p.isActive
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 hover:bg-emerald-100"
                            : "bg-ink-100 text-ink-500 ring-ink-500/20 hover:bg-ink-200"
                        }`}
                      >
                        {p.isActive ? "Active" : "Inactive"}
                      </button>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-2.5">
                        <button
                          onClick={() => openTopup(p)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                        >
                          <Wallet size={13} /> Top Up
                        </button>
                        <button
                          onClick={() => openHistory(p)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800"
                        >
                          <History size={13} /> History
                        </button>
                        {Number(p.rentAmount) > 0 && (
                          <button
                            onClick={() => debitRent(p)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                          >
                            <ReceiptText size={13} /> Debit Rent
                          </button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}

          {topupFor && (
            <Card className="mt-4 p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-ink-900">
                  Fund {topupFor.name}'s wallet
                </div>
                <button onClick={() => setTopupFor(null)} className="text-ink-400 hover:text-ink-700">
                  <X size={16} />
                </button>
              </div>
              <form className="flex flex-wrap items-end gap-3" onSubmit={handleTopup}>
                <FormField label="Wallet">
                  <select
                    value={topupSlot}
                    onChange={(e) => setTopupSlot(Number(e.target.value) as 1 | 2)}
                    className={`${compactInputClasses} w-auto`}
                  >
                    <option value={1}>Wallet 1 (operational)</option>
                    <option value={2}>{topupFor.secondaryWalletLabel} (manual reserve)</option>
                  </select>
                </FormField>
                <FormField label="Amount (₹)">
                  <input
                    type="number"
                    min="1"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(e.target.value)}
                    className={`${compactInputClasses} w-36`}
                    required
                  />
                </FormField>
                <Button type="submit" loading={topupSubmitting}>
                  Fund from Admin Wallet
                </Button>
              </form>
              {topupError && <div className="mt-3 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{topupError}</div>}
            </Card>
          )}

          {historyFor && (
            <Card className="mt-4 p-0">
              <div className="flex items-center justify-between border-b border-ink-100 p-4">
                <div className="text-sm font-semibold text-ink-900">{historyFor.name} — Wallet History</div>
                <button onClick={() => setHistoryFor(null)} className="text-ink-400 hover:text-ink-700">
                  <X size={16} />
                </button>
              </div>
              {walletHistory.length === 0 ? (
                <div className="p-6 text-center text-sm text-ink-400">No wallet activity yet.</div>
              ) : (
                <Table>
                  <THead>
                    <Th>Wallet</Th>
                    <Th>Type</Th>
                    <Th>Amount</Th>
                    <Th>Balance After</Th>
                    <Th>Description</Th>
                    <Th>Date</Th>
                  </THead>
                  <tbody>
                    {walletHistory.map((w) => (
                      <Tr key={w.id}>
                        <Td>{w.walletSlot === 1 ? "Wallet 1" : historyFor.secondaryWalletLabel}</Td>
                        <Td className={w.type === "CREDIT" ? "text-emerald-600" : "text-rose-600"}>{w.type}</Td>
                        <Td>{w.type === "CREDIT" ? "+" : "-"}₹{w.amount}</Td>
                        <Td>₹{w.balanceAfter}</Td>
                        <Td className="text-ink-500">{w.description ?? "-"}</Td>
                        <Td className="text-ink-500">{new Date(w.createdAt).toLocaleString()}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          )}
        </div>
      </div>

      {rentEntries.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Rent Debit History
          </h2>
          <Table>
            <THead>
              <Th>Provider</Th>
              <Th>Amount</Th>
              <Th>Balance After</Th>
              <Th>Date</Th>
            </THead>
            <tbody>
              {rentEntries.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium text-ink-900">{r.provider?.name ?? "-"}</Td>
                  <Td className="text-rose-600">-₹{r.amount}</Td>
                  <Td>₹{r.balanceAfter}</Td>
                  <Td className="text-ink-500">{new Date(r.createdAt).toLocaleString()}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      {rentUpdateLogs.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
            <History size={14} /> Rent Amount Update Log
          </h2>
          <Table>
            <THead>
              <Th>Changed By</Th>
              <Th>Change</Th>
              <Th>Date</Th>
            </THead>
            <tbody>
              {rentUpdateLogs.map((l) => (
                <Tr key={l.id}>
                  <Td className="font-medium text-ink-900">{l.user ? `${l.user.name} (${l.user.phone})` : "-"}</Td>
                  <Td className="text-ink-500">{l.details ?? "-"}</Td>
                  <Td className="text-ink-500">{new Date(l.createdAt).toLocaleString()}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
