import { type FormEvent, useEffect, useState } from "react";
import { ArrowLeftRight, Wallet, CheckCircle2, XCircle, PiggyBank } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField, inputClasses } from "../components/ui/FormField";

interface DownlineUser {
  id: string;
  name: string;
  phone: string;
  role: string;
}

export function TransferPage() {
  const { user } = useAuth();
  const isRootAdmin = user?.role === "ADMIN";

  const [balance, setBalance] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState("");
  const [paymentInfo, setPaymentInfo] = useState("");
  const [fundReference, setFundReference] = useState("");
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState("");
  const [fundSuccess, setFundSuccess] = useState("");
  const [downline, setDownline] = useState<DownlineUser[]>([]);
  const [toUserId, setToUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentModes, setPaymentModes] = useState<string[]>([]);
  const [paymentMode, setPaymentMode] = useState("");
  const [utrNumber, setUtrNumber] = useState("");
  const [autoCommission, setAutoCommission] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loaded, setLoaded] = useState(false);

  function loadData() {
    Promise.all([api.get("/wallet/balance"), api.get("/users"), api.get("/payment-modes")]).then(
      ([balanceRes, usersRes, modesRes]) => {
        setBalance(balanceRes.data.balance);
        setDownline(usersRes.data.users);
        setToUserId((prev) => prev || usersRes.data.users[0]?.id || "");
        const activeModes = modesRes.data.modes.filter((m: { isActive: boolean }) => m.isActive).map((m: { name: string }) => m.name);
        setPaymentModes(activeModes);
        setPaymentMode((prev) => prev || activeModes[0] || "");
        setLoaded(true);
      }
    );
  }

  useEffect(loadData, []);

  async function handleSelfFund(e: FormEvent) {
    e.preventDefault();
    setFundError("");
    setFundSuccess("");
    setFunding(true);
    try {
      await api.post("/wallet/self-fund", {
        amount: Number(fundAmount),
        paymentInfo,
        reference: fundReference || undefined,
      });
      setFundSuccess(`₹${fundAmount} added to platform balance.`);
      setFundAmount("");
      setPaymentInfo("");
      setFundReference("");
      loadData();
    } catch (err: any) {
      setFundError(err.response?.data?.error || "Could not add balance.");
    } finally {
      setFunding(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const res = await api.post("/wallet/transfer", {
        toUserId,
        amount: Number(amount),
        paymentMode,
        utrNumber: utrNumber || undefined,
        autoCommission,
      });
      setSuccess(
        res.data.commission > 0
          ? `₹${amount} sent. ₹${res.data.commission} retained as your commission.`
          : `₹${amount} transferred successfully.`
      );
      setAmount("");
      setUtrNumber("");
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || "Transfer failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Transfer Funds" subtitle="Send balance to someone in your downline." />

      <div className="mb-6 max-w-xs">
        <StatCard label="Your Wallet Balance" value={`₹${balance ?? "..."}`} icon={<Wallet size={19} />} />
      </div>

      {isRootAdmin && (
        <Card className="mb-6 max-w-md p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <PiggyBank size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900">Add Balance</div>
              <div className="text-xs text-ink-500">
                Bring outside capital (bank deposit, etc.) into the platform
              </div>
            </div>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSelfFund}>
            <FormField label="Amount (₹)">
              <input
                type="number"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                min="1"
                className={inputClasses}
                required
              />
            </FormField>
            <FormField label="Payment Info" hint="e.g. Bank NEFT, cheque number">
              <input
                value={paymentInfo}
                onChange={(e) => setPaymentInfo(e.target.value)}
                className={inputClasses}
                required
              />
            </FormField>
            <FormField label="Reference (optional)">
              <input
                value={fundReference}
                onChange={(e) => setFundReference(e.target.value)}
                className={inputClasses}
              />
            </FormField>

            {fundError && (
              <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{fundError}</div>
            )}
            {fundSuccess && (
              <div className="rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
                {fundSuccess}
              </div>
            )}

            <Button type="submit" variant="secondary" loading={funding}>
              {funding ? "Adding..." : "Add Balance"}
            </Button>
          </form>
        </Card>
      )}

      {loaded && downline.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ArrowLeftRight size={22} />}
            message="You have no users in your downline to transfer funds to."
          />
        </Card>
      ) : (
        <div className="grid max-w-md gap-5">
          <Card className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <ArrowLeftRight size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink-900">Send Balance</div>
                <div className="text-xs text-ink-500">Funds move instantly, ledger-tracked</div>
              </div>
            </div>

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <FormField label="Transfer To">
                <select
                  value={toUserId}
                  onChange={(e) => setToUserId(e.target.value)}
                  className={inputClasses}
                  required
                >
                  {downline.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.phone}) - {u.role.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Amount (₹)">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="1"
                  step="1"
                  className={inputClasses}
                  required
                />
              </FormField>

              <FormField label="Payment Mode">
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className={inputClasses}
                  required
                >
                  {paymentModes.map((m) => (
                    <option key={m} value={m}>
                      {m.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="UTR / Reference Number (optional)">
                <input
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value)}
                  className={inputClasses}
                />
              </FormField>

              <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
                <input type="checkbox" checked={autoCommission} onChange={(e) => setAutoCommission(e.target.checked)} />
                Auto Calculate Flat Commission
                <span className="text-xs font-normal text-ink-400">(retain a small % as your handling fee)</span>
              </label>

              <Button type="submit" loading={submitting} className="mt-1">
                {submitting ? "Transferring..." : "Transfer"}
              </Button>
            </form>
          </Card>

          {error && (
            <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 px-4 py-3.5 text-sm text-rose-700">
              <XCircle size={18} className="shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 px-4 py-3.5 text-sm text-emerald-700">
              <CheckCircle2 size={18} className="shrink-0" />
              {success}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
