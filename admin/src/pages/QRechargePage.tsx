import { type FormEvent, useEffect, useState } from "react";
import { Clock3, Send, XCircle } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField, inputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

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

interface QueuedEntry {
  id: string;
  operatorCode: string;
  identifier: string;
  amount: string;
  scheduledFor: string;
  status: string;
  resultMessage: string | null;
  user: { name: string; phone: string };
}

export function QRechargePage() {
  const [users, setUsers] = useState<DownlineUser[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [entries, setEntries] = useState<QueuedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState("");
  const [operatorCode, setOperatorCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [amount, setAmount] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    Promise.all([api.get("/users"), api.get("/operators"), api.get("/queued-recharge")]).then(
      ([usersRes, opRes, qRes]) => {
        setUsers(usersRes.data.users);
        setOperators(opRes.data.operators);
        setEntries(qRes.data.entries);
        setUserId((prev) => prev || usersRes.data.users[0]?.id || "");
        setOperatorCode((prev) => prev || opRes.data.operators[0]?.code || "");
        setLoading(false);
      }
    );
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/queued-recharge", {
        userId,
        operatorCode,
        identifier,
        amount: Number(amount),
        scheduledFor: new Date(scheduledFor).toISOString(),
      });
      setIdentifier("");
      setAmount("");
      setScheduledFor("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not queue recharge.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: string) {
    await api.post(`/queued-recharge/${id}/cancel`, {});
    load();
  }

  return (
    <div>
      <PageHeader
        title="Q Recharge"
        subtitle="Schedule a recharge to run at a future time instead of immediately."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Clock3 size={18} />
            </div>
            <div className="text-sm font-semibold text-ink-900">Queue a Recharge</div>
          </div>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
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
            <FormField label="Run At">
              <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className={inputClasses} required />
            </FormField>
            {error && <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}
            <Button type="submit" loading={submitting}>
              <Send size={15} /> {submitting ? "Queuing..." : "Queue Recharge"}
            </Button>
          </form>
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Queue</h2>
          {loading ? null : entries.length === 0 ? (
            <Card>
              <EmptyState icon={<Clock3 size={22} />} message="No queued recharges." />
            </Card>
          ) : (
            <Table>
              <THead>
                <Th>User</Th><Th>Operator</Th><Th>Identifier</Th><Th>Amount</Th><Th>Run At</Th><Th>Status</Th><Th />
              </THead>
              <tbody>
                {entries.map((e) => (
                  <Tr key={e.id}>
                    <Td className="font-medium text-ink-900">{e.user.name}</Td>
                    <Td>{e.operatorCode}</Td>
                    <Td>{e.identifier}</Td>
                    <Td>₹{e.amount}</Td>
                    <Td className="text-ink-500">{new Date(e.scheduledFor).toLocaleString()}</Td>
                    <Td><Badge>{e.status}</Badge></Td>
                    <Td className="text-right">
                      {e.status === "QUEUED" && (
                        <button onClick={() => cancel(e.id)} className="text-ink-400 hover:text-rose-600" title="Cancel">
                          <XCircle size={15} />
                        </button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
