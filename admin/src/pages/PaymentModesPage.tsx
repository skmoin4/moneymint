import { type FormEvent, useEffect, useState } from "react";
import { CreditCard, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField, inputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

interface Mode {
  id: string;
  name: string;
  isActive: boolean;
}

export function PaymentModesPage() {
  const [modes, setModes] = useState<Mode[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    api.get("/payment-modes").then((res) => {
      setModes(res.data.modes);
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/payment-modes", { name });
      setName("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not add payment mode.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(m: Mode) {
    await api.patch(`/payment-modes/${m.id}`, { isActive: !m.isActive });
    load();
  }

  async function remove(id: string) {
    await api.delete(`/payment-modes/${id}`);
    load();
  }

  return (
    <div>
      <PageHeader title="Master Payment Modes" subtitle="Payment modes offered when transferring funds." />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Plus size={18} />
            </div>
            <div className="text-sm font-semibold text-ink-900">Add Payment Mode</div>
          </div>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FormField label="Name" hint="e.g. CHEQUE, RTGS">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} required />
            </FormField>
            {error && <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}
            <Button type="submit" loading={submitting}>
              {submitting ? "Adding..." : "Add Mode"}
            </Button>
          </form>
        </Card>

        <div>
          {loading ? null : modes.length === 0 ? (
            <Card>
              <EmptyState icon={<CreditCard size={22} />} message="No payment modes configured." />
            </Card>
          ) : (
            <Table>
              <THead>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th />
              </THead>
              <tbody>
                {modes.map((m) => (
                  <Tr key={m.id}>
                    <Td className="font-medium text-ink-900">{m.name}</Td>
                    <Td>
                      <button
                        onClick={() => toggle(m)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${
                          m.isActive
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 hover:bg-emerald-100"
                            : "bg-ink-100 text-ink-500 ring-ink-500/20 hover:bg-ink-200"
                        }`}
                      >
                        {m.isActive ? "Active" : "Inactive"}
                      </button>
                    </Td>
                    <Td className="text-right">
                      <button onClick={() => remove(m.id)} className="text-ink-400 hover:text-rose-600">
                        <Trash2 size={14} />
                      </button>
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
