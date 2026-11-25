import { type FormEvent, useEffect, useState } from "react";
import { PlusCircle, FileSpreadsheet } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { FormField, inputClasses } from "../components/ui/FormField";

interface DownlineUser {
  id: string;
  name: string;
  phone: string;
}

interface Operator {
  id: string;
  name: string;
  code: string;
}

const TABS = ["Add Txn Single", "Add Txn Master"] as const;
type Tab = (typeof TABS)[number];

export function ManualTxnPage() {
  const [tab, setTab] = useState<Tab>("Add Txn Single");
  const [users, setUsers] = useState<DownlineUser[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);

  const [userId, setUserId] = useState("");
  const [operatorCode, setOperatorCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [amount, setAmount] = useState("");
  const [outcome, setOutcome] = useState<"SUCCESS" | "FAILED">("SUCCESS");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const [bulkText, setBulkText] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ succeeded: number; failed: number; results: any[] } | null>(null);

  useEffect(() => {
    api.get("/users").then((res) => {
      setUsers(res.data.users);
      setUserId((prev) => prev || res.data.users[0]?.id || "");
    });
    api.get("/operators").then((res) => {
      setOperators(res.data.operators);
      setOperatorCode((prev) => prev || res.data.operators[0]?.code || "");
    });
  }, []);

  async function handleSingle(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult("");
    setSubmitting(true);
    try {
      await api.post("/manual-txn/single", {
        userId,
        operatorCode,
        identifier,
        amount: Number(amount),
        outcome,
        remark: remark || undefined,
      });
      setResult("Transaction recorded.");
      setIdentifier("");
      setAmount("");
      setRemark("");
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not create transaction.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBulk(e: FormEvent) {
    e.preventDefault();
    setBulkResult(null);
    setBulkSubmitting(true);
    try {
      const entries = bulkText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [phone, opCode, ident, amt, out] = line.split(",").map((s) => s.trim());
          const user = users.find((u) => u.phone === phone);
          return {
            userId: user?.id ?? "",
            operatorCode: opCode,
            identifier: ident,
            amount: Number(amt),
            outcome: (out?.toUpperCase() === "FAILED" ? "FAILED" : "SUCCESS") as "SUCCESS" | "FAILED",
          };
        })
        .filter((e) => e.userId);
      const res = await api.post("/manual-txn/master", { entries });
      setBulkResult(res.data);
    } finally {
      setBulkSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Add Transaction" subtitle="Manually record a transaction outcome for reconciliation." />

      <div className="mb-5 flex gap-2 border-b border-ink-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t ? "border-brand-600 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Add Txn Single" ? (
        <Card className="max-w-md p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <PlusCircle size={18} />
            </div>
            <div className="text-sm font-semibold text-ink-900">Single Entry</div>
          </div>
          <form className="flex flex-col gap-4" onSubmit={handleSingle}>
            <FormField label="User">
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className={inputClasses} required>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.phone})</option>
                ))}
              </select>
            </FormField>
            <FormField label="Operator">
              <select value={operatorCode} onChange={(e) => setOperatorCode(e.target.value)} className={inputClasses} required>
                {operators.map((o) => (
                  <option key={o.id} value={o.code}>{o.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Mobile / Consumer #">
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={inputClasses} required />
            </FormField>
            <FormField label="Amount (₹)">
              <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClasses} required />
            </FormField>
            <FormField label="Outcome">
              <select value={outcome} onChange={(e) => setOutcome(e.target.value as "SUCCESS" | "FAILED")} className={inputClasses}>
                <option value="SUCCESS">Success</option>
                <option value="FAILED">Failed (refunds the user)</option>
              </select>
            </FormField>
            <FormField label="Remark (optional)">
              <input value={remark} onChange={(e) => setRemark(e.target.value)} className={inputClasses} />
            </FormField>
            {error && <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}
            {result && <div className="rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">{result}</div>}
            <Button type="submit" loading={submitting}>
              {submitting ? "Recording..." : "Record Transaction"}
            </Button>
          </form>
        </Card>
      ) : (
        <Card className="max-w-2xl p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900">Bulk Entry</div>
              <div className="text-xs text-ink-500">One row per line: phone, operatorCode, identifier, amount, outcome</div>
            </div>
          </div>
          <form className="flex flex-col gap-4" onSubmit={handleBulk}>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={8}
              placeholder={"8888888888,AIRTEL,9812345670,199,SUCCESS\n8888888888,JIO,9812345671,299,FAILED"}
              className={`${inputClasses} font-mono text-xs`}
            />
            <Button type="submit" loading={bulkSubmitting}>
              {bulkSubmitting ? "Processing..." : "Process Batch"}
            </Button>
          </form>
          {bulkResult && (
            <div className="mt-4 text-sm text-ink-700">
              <div className="mb-2 font-semibold">
                {bulkResult.succeeded} succeeded, {bulkResult.failed} failed
              </div>
              <ul className="flex flex-col gap-1 text-xs">
                {bulkResult.results.map((r, i) => (
                  <li key={i} className={r.ok ? "text-emerald-600" : "text-rose-600"}>
                    {r.identifier}: {r.ok ? "OK" : r.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
