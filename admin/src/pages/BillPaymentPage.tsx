import { type FormEvent, useEffect, useState } from "react";
import { CheckCircle2, XCircle, Receipt as ReceiptIcon, FileSearch } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { FormField, inputClasses } from "../components/ui/FormField";

interface Operator {
  id: string;
  name: string;
  code: string;
  type: string;
}

interface Bill {
  consumerName: string;
  dueAmount: number;
  dueDate: string;
}

interface PayResult {
  status: string;
  amount: string;
  commission: string;
  providerRefId: string | null;
}

const BILL_OPERATOR_TYPES = ["ELECTRICITY", "GAS", "WATER"];

export function BillPaymentPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [operatorCode, setOperatorCode] = useState("");
  const [consumerNumber, setConsumerNumber] = useState("");
  const [bill, setBill] = useState<Bill | null>(null);
  const [fetching, setFetching] = useState(false);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<PayResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/operators", { params: { activeOnly: 1 } }).then((res) => {
      const billers = res.data.operators.filter((o: Operator) =>
        BILL_OPERATOR_TYPES.includes(o.type)
      );
      setOperators(billers);
      if (billers.length > 0) setOperatorCode(billers[0].code);
    });
  }, []);

  async function handleFetchBill(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setBill(null);
    setFetching(true);
    try {
      const res = await api.post("/bbps/fetch-bill", { operatorCode, consumerNumber });
      setBill(res.data.bill);
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not fetch bill.");
    } finally {
      setFetching(false);
    }
  }

  async function handlePay() {
    if (!bill) return;
    setError("");
    setPaying(true);
    try {
      const res = await api.post("/bbps/pay", {
        operatorCode,
        consumerNumber,
        amount: bill.dueAmount,
      });
      setResult(res.data.transaction);
      setBill(null);
      setConsumerNumber("");
    } catch (err: any) {
      setError(err.response?.data?.error || "Payment failed. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div>
      <PageHeader title="Bill Payments" subtitle="Pay electricity, gas, and water bills via BBPS." />

      {operators.length === 0 ? (
        <Card className="p-6 text-sm text-ink-500">
          No bill-payment operators configured yet. Ask your admin to add one under Operators.
        </Card>
      ) : (
        <div className="grid max-w-md gap-5">
          <Card className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <ReceiptIcon size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink-900">Bill Details</div>
                <div className="text-xs text-ink-500">Fetch the bill before paying</div>
              </div>
            </div>

            <form className="flex flex-col gap-4" onSubmit={handleFetchBill}>
              <FormField label="Biller">
                <select
                  value={operatorCode}
                  onChange={(e) => {
                    setOperatorCode(e.target.value);
                    setBill(null);
                  }}
                  className={inputClasses}
                >
                  {operators.map((op) => (
                    <option key={op.id} value={op.code}>
                      {op.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Consumer / Account Number">
                <input
                  type="text"
                  value={consumerNumber}
                  onChange={(e) => {
                    setConsumerNumber(e.target.value);
                    setBill(null);
                  }}
                  placeholder="Enter consumer number"
                  className={inputClasses}
                  required
                />
              </FormField>

              <Button type="submit" variant="secondary" loading={fetching} className="mt-1">
                <FileSearch size={16} />
                {fetching ? "Fetching..." : "Fetch Bill"}
              </Button>
            </form>

            {bill && (
              <div className="mt-5 rounded-xl border border-ink-100 bg-ink-50/60 p-4 text-sm">
                <div className="flex justify-between text-ink-500">
                  <span>Consumer</span>
                  <span className="font-medium text-ink-900">{bill.consumerName}</span>
                </div>
                <div className="mt-1.5 flex justify-between text-ink-500">
                  <span>Due Date</span>
                  <span className="font-medium text-ink-900">{bill.dueDate}</span>
                </div>
                <div className="mt-1.5 flex justify-between text-ink-500">
                  <span>Amount Due</span>
                  <span className="text-base font-bold text-brand-600">₹{bill.dueAmount}</span>
                </div>
                <Button onClick={handlePay} loading={paying} className="mt-4 w-full">
                  {paying ? "Paying..." : `Pay ₹${bill.dueAmount}`}
                </Button>
              </div>
            )}
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
                {result.status === "SUCCESS" ? "Bill Paid" : "Payment Failed"}
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
      )}
    </div>
  );
}
