import { type FormEvent, useEffect, useState } from "react";
import { Landmark, Send, CheckCircle2, XCircle, Inbox, QrCode } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField, inputClasses } from "../components/ui/FormField";

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  upiId: string | null;
}

interface BalanceRequest {
  id: string;
  amount: string;
  utrNumber: string;
  status: string;
  remarks: string | null;
  createdAt: string;
  qrSettled?: boolean;
  user?: { name: string; phone: string };
}

export function BalanceRequestsPage() {
  const { user } = useAuth();
  const isRootAdmin = user?.role === "ADMIN";
  const canReview = user?.role !== "RETAILER";

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [own, setOwn] = useState<BalanceRequest[]>([]);
  const [team, setTeam] = useState<BalanceRequest[]>([]);
  const [qrSettlement, setQrSettlement] = useState<BalanceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState("");
  const [utrNumber, setUtrNumber] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [depositedAt, setDepositedAt] = useState("");
  const [modes, setModes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);

  async function toggleQr(a: BankAccount) {
    if (qrFor === a.id) {
      setQrFor(null);
      return;
    }
    const params = amount ? { amount } : undefined;
    const res = await api.get(`/bank-accounts/${a.id}/upi-qr`, { params });
    setQrImage(res.data.qrCodeDataUrl);
    setQrFor(a.id);
  }

  function loadAll() {
    setLoading(true);
    Promise.all([
      api.get("/bank-accounts"),
      api.get("/balance-requests"),
      api.get("/payment-modes").catch(() => ({ data: { modes: [] } })),
      canReview ? api.get("/balance-requests/team") : Promise.resolve({ data: { requests: [] } }),
      canReview ? api.get("/balance-requests/qr-settlement") : Promise.resolve({ data: { requests: [] } }),
    ]).then(([accRes, ownRes, modesRes, teamRes, qrRes]) => {
      setAccounts(accRes.data.accounts);
      setModes((modesRes.data.modes as { name: string; isActive: boolean }[]).filter((m) => m.isActive).map((m) => m.name));
      setOwn(ownRes.data.requests);
      setTeam(teamRes.data.requests);
      setQrSettlement(qrRes.data.requests);
      setLoading(false);
    });
  }

  useEffect(loadAll, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/balance-requests", {
        amount: Number(amount),
        utrNumber: utrNumber.trim(),
        bankAccountId: bankAccountId || undefined,
        paymentMode: paymentMode || undefined,
        depositedAt: depositedAt || undefined,
      });
      setAmount("");
      setUtrNumber("");
      setDepositedAt("");
      loadAll();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function review(id: string, action: "approve" | "reject") {
    if (action === "approve" && !window.confirm(isRootAdmin ? "Approve and credit this request?" : "Approve? The amount will be transferred from your wallet.")) return;
    try {
      await api.post(`/balance-requests/${id}/${action}`, {});
    } catch (err: any) {
      window.alert(err.response?.data?.error || "Could not update the request.");
    }
    loadAll();
  }

  async function toggleQrSettle(id: string) {
    await api.post(`/balance-requests/${id}/qr-settle`, {});
    loadAll();
  }

  return (
    <div>
      <PageHeader
        title="Balance Requests"
        subtitle="Deposit into the bank account below, then file a claim with your UTR for your parent to verify."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="flex flex-col gap-5">
          {accounts.length > 0 && (
            <Card className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Landmark size={18} />
                </div>
                <div className="text-sm font-semibold text-ink-900">Deposit To</div>
              </div>
              {accounts.map((a) => (
                <div key={a.id} className="mb-3 rounded-lg border border-ink-100 p-3 text-sm last:mb-0">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-ink-900">{a.accountName}</div>
                    {a.upiId && (
                      <button
                        onClick={() => toggleQr(a)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                      >
                        <QrCode size={13} /> {qrFor === a.id ? "Hide" : "Show"} QR
                      </button>
                    )}
                  </div>
                  <div className="text-ink-500">
                    {a.accountNumber} · {a.ifsc} · {a.bankName}
                  </div>
                  {qrFor === a.id && qrImage && (
                    <div className="mt-3 flex flex-col items-center gap-1 rounded-lg bg-ink-50 p-4">
                      <img src={qrImage} alt="UPI QR code" width={180} height={180} />
                      <p className="text-xs text-ink-500">Scan to pay{amount ? ` ₹${amount}` : ""}</p>
                    </div>
                  )}
                </div>
              ))}
            </Card>
          )}

          {!isRootAdmin && (
            <Card className="p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Send size={18} />
                </div>
                <div className="text-sm font-semibold text-ink-900">File a Claim</div>
              </div>
              <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                <FormField label="Amount (₹)">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min="1"
                    className={inputClasses}
                    required
                  />
                </FormField>
                <FormField label="UTR / Transaction Reference">
                  <input
                    value={utrNumber}
                    onChange={(e) => setUtrNumber(e.target.value)}
                    className={inputClasses}
                    required
                  />
                </FormField>
                {accounts.length > 0 && (
                  <FormField label="Deposited into">
                    <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className={inputClasses} required>
                      <option value="">Select account</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bankName} ••{a.accountNumber.slice(-4)} ({a.accountName})
                        </option>
                      ))}
                    </select>
                  </FormField>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Payment mode">
                    <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={inputClasses}>
                      <option value="">Select</option>
                      {modes.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Deposit date">
                    <input type="date" value={depositedAt} onChange={(e) => setDepositedAt(e.target.value)} className={inputClasses} />
                  </FormField>
                </div>
                {error && (
                  <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>
                )}
                <Button type="submit" loading={submitting}>
                  {submitting ? "Submitting..." : "Submit Claim"}
                </Button>
              </form>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-8">
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
              Your Requests
            </h2>
            {loading ? null : own.length === 0 ? (
              <Card>
                <EmptyState icon={<Inbox size={22} />} message="No balance requests yet." />
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {own.map((r) => (
                  <Card key={r.id} className="flex items-center justify-between p-4">
                    <div>
                      <div className="text-sm font-semibold text-ink-900">₹{r.amount}</div>
                      <div className="text-xs text-ink-500">UTR: {r.utrNumber}</div>
                    </div>
                    <Badge>{r.status}</Badge>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {canReview && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
                Team Requests
              </h2>
              {loading ? null : team.length === 0 ? (
                <Card>
                  <EmptyState icon={<Inbox size={22} />} message="No requests from your team." />
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {team.map((r) => (
                    <Card key={r.id} className="flex items-center justify-between p-4">
                      <div>
                        <div className="text-sm font-semibold text-ink-900">
                          {r.user?.name} · ₹{r.amount}
                        </div>
                        <div className="text-xs text-ink-500">
                          {r.user?.phone} · UTR: {r.utrNumber}
                        </div>
                      </div>
                      {r.status === "PENDING" ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => review(r.id, "approve")}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                          <button
                            onClick={() => review(r.id, "reject")}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
                          >
                            <XCircle size={16} />
                          </button>
                        </div>
                      ) : (
                        <Badge>{r.status}</Badge>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {canReview && qrSettlement.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
                UPI QR Settlement
              </h2>
              <p className="mb-3 text-xs text-ink-500">
                Confirm which approved requests have actually landed in your bank account.
              </p>
              <div className="flex flex-col gap-3">
                {qrSettlement.map((r) => (
                  <Card key={r.id} className="flex items-center justify-between p-4">
                    <div>
                      <div className="text-sm font-semibold text-ink-900">
                        {r.user?.name} · ₹{r.amount}
                      </div>
                      <div className="text-xs text-ink-500">
                        {r.user?.phone} · UTR: {r.utrNumber}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleQrSettle(r.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${
                        r.qrSettled
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 hover:bg-emerald-100"
                          : "bg-ink-100 text-ink-500 ring-ink-500/20 hover:bg-ink-200"
                      }`}
                    >
                      {r.qrSettled ? "Settled" : "Unsettled"}
                    </button>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
