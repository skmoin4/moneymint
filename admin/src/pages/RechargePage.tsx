import { type FormEvent, useEffect, useState } from "react";
import { CheckCircle2, XCircle, Smartphone } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { FormField, inputClasses } from "../components/ui/FormField";

interface Operator {
  id: string;
  name: string;
  code: string;
}

interface RechargeResult {
  status: string;
  amount: string;
  commission: string;
  providerRefId: string | null;
}

export function RechargePage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [operatorCode, setOperatorCode] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RechargeResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/operators", { params: { activeOnly: 1 } }).then((res) => {
      setOperators(res.data.operators);
      if (res.data.operators.length > 0) {
        setOperatorCode(res.data.operators[0].code);
      }
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setSubmitting(true);
    try {
      const res = await api.post("/recharge", {
        operatorCode,
        mobileNumber,
        amount: Number(amount),
      });
      setResult(res.data.transaction);
      setMobileNumber("");
      setAmount("");
    } catch (err: any) {
      setError(err.response?.data?.error || "Recharge failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="New Recharge" subtitle="Process a mobile recharge for a customer." />

      <div className="grid max-w-md gap-5">
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Smartphone size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900">Recharge Details</div>
              <div className="text-xs text-ink-500">Fill in the customer's details</div>
            </div>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FormField label="Operator">
              <select
                value={operatorCode}
                onChange={(e) => setOperatorCode(e.target.value)}
                className={inputClasses}
                required
              >
                {operators.map((op) => (
                  <option key={op.id} value={op.code}>
                    {op.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Mobile Number">
              <input
                type="text"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="10-digit mobile number"
                className={inputClasses}
                required
              />
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

            <Button type="submit" loading={submitting} className="mt-1">
              {submitting ? "Processing..." : "Recharge"}
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
              {result.status === "SUCCESS" ? (
                <CheckCircle2 size={18} />
              ) : (
                <XCircle size={18} />
              )}
              {result.status === "SUCCESS" ? "Recharge Successful" : "Recharge Failed"}
            </div>
            <div className="mt-2 space-y-1 text-ink-600">
              <div>Amount: ₹{result.amount}</div>
              {result.status === "SUCCESS" && Number(result.commission) > 0 && (
                <div>Commission earned: ₹{result.commission}</div>
              )}
              {result.status === "FAILED" && <div>Amount refunded to your wallet.</div>}
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
