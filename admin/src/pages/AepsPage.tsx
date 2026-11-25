import { type FormEvent, useState } from "react";
import { Fingerprint, CheckCircle2, XCircle, Wallet2, Landmark } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { FormField, inputClasses } from "../components/ui/FormField";

const BANKS = [
  "State Bank of India",
  "HDFC Bank",
  "ICICI Bank",
  "Punjab National Bank",
  "Bank of Baroda",
  "Axis Bank",
];

type AepsMode = "CASH_WITHDRAWAL" | "BALANCE_ENQUIRY";

interface TxnResult {
  status: string;
  amount: string;
  commission: string;
  providerRefId: string | null;
  apiResponse?: { balance?: number };
}

export function AepsPage() {
  const [mode, setMode] = useState<AepsMode>("CASH_WITHDRAWAL");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [bankName, setBankName] = useState(BANKS[0]);
  const [amount, setAmount] = useState("");
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TxnResult | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setScanning(true);

    // Simulate a biometric (fingerprint) authentication step before hitting the API.
    await new Promise((resolve) => setTimeout(resolve, 1600));
    setScanning(false);
    setSubmitting(true);

    try {
      if (mode === "CASH_WITHDRAWAL") {
        const res = await api.post("/aeps/withdrawal", {
          aadhaarNumber,
          bankName,
          amount: Number(amount),
        });
        setResult(res.data.transaction);
      } else {
        const res = await api.post("/aeps/balance-enquiry", { aadhaarNumber, bankName });
        setResult(res.data.transaction);
      }
      setAmount("");
    } catch (err: any) {
      setError(err.response?.data?.error || "AEPS request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="AEPS" subtitle="Aadhaar-enabled cash withdrawal and balance enquiry." />

      <div className="grid max-w-md gap-5">
        <Card className="p-6">
          <div className="mb-5 flex gap-2 rounded-lg bg-ink-100 p-1">
            <button
              onClick={() => setMode("CASH_WITHDRAWAL")}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${
                mode === "CASH_WITHDRAWAL" ? "bg-white text-brand-600 shadow-sm" : "text-ink-500"
              }`}
            >
              Cash Withdrawal
            </button>
            <button
              onClick={() => setMode("BALANCE_ENQUIRY")}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${
                mode === "BALANCE_ENQUIRY" ? "bg-white text-brand-600 shadow-sm" : "text-ink-500"
              }`}
            >
              Balance Enquiry
            </button>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FormField label="Aadhaar Number" hint="12 digits">
              <input
                value={aadhaarNumber}
                onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, ""))}
                maxLength={12}
                className={inputClasses}
                required
              />
            </FormField>

            <FormField label="Bank">
              <select value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputClasses}>
                {BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </FormField>

            {mode === "CASH_WITHDRAWAL" && (
              <FormField label="Amount (₹)">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="1"
                  max="10000"
                  className={inputClasses}
                  required
                />
              </FormField>
            )}

            <Button type="submit" loading={scanning || submitting} className="mt-1">
              {scanning ? (
                <>
                  <Fingerprint size={16} className="animate-pulse" /> Scanning fingerprint...
                </>
              ) : submitting ? (
                "Processing..."
              ) : (
                <>
                  <Fingerprint size={16} /> Authenticate &amp; Proceed
                </>
              )}
            </Button>
          </form>
        </Card>

        {error && (
          <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 px-4 py-3.5 text-sm text-rose-700">
            <XCircle size={18} className="shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <div
            className={`rounded-xl px-4 py-4 text-sm ${
              result.status === "SUCCESS" ? "bg-emerald-50" : "bg-rose-50"
            }`}
          >
            <div
              className={`flex items-center gap-2 font-semibold ${
                result.status === "SUCCESS" ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {result.status === "SUCCESS" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              {result.status === "SUCCESS" ? "Authenticated" : "Authentication Failed"}
            </div>
            <div className="mt-2 space-y-1 text-ink-600">
              {mode === "CASH_WITHDRAWAL" ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <Wallet2 size={14} /> Amount: ₹{result.amount}
                  </div>
                  {result.status === "SUCCESS" && Number(result.commission) > 0 && (
                    <div>Commission earned: ₹{result.commission}</div>
                  )}
                </>
              ) : (
                result.status === "SUCCESS" && (
                  <div className="flex items-center gap-1.5 text-base font-bold text-ink-900">
                    <Landmark size={14} /> Available Balance: ₹{result.apiResponse?.balance}
                  </div>
                )
              )}
              {result.providerRefId && (
                <div className="font-mono text-xs text-ink-400">Ref: {result.providerRefId}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
