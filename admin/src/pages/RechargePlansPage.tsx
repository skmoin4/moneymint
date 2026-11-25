import { type FormEvent, useEffect, useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField, inputClasses, compactInputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

interface Operator {
  id: string;
  name: string;
  code: string;
}

interface Plan {
  id: string;
  operator: Operator;
  amount: string;
  validity: string | null;
  data: string | null;
  talktime: string | null;
  sms: string | null;
  description: string | null;
  category: string;
  isActive: boolean;
}

const CATEGORIES = ["Popular", "Data", "Unlimited", "Topup", "Special", "Roaming"];

export function RechargePlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [filterOperatorId, setFilterOperatorId] = useState("");

  const [operatorId, setOperatorId] = useState("");
  const [amount, setAmount] = useState("");
  const [validity, setValidity] = useState("");
  const [data, setData] = useState("");
  const [talktime, setTalktime] = useState("");
  const [sms, setSms] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);

  function load() {
    setLoading(true);
    Promise.all([api.get("/plans/all"), api.get("/operators")]).then(([pRes, oRes]) => {
      setPlans(pRes.data.plans);
      setOperators(oRes.data.operators);
      setOperatorId((prev) => prev || oRes.data.operators[0]?.id || "");
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!operatorId || !amount) return;
    setSubmitting(true);
    try {
      await api.post("/plans", {
        operatorId,
        amount: Number(amount),
        validity: validity || undefined,
        data: data || undefined,
        talktime: talktime || undefined,
        sms: sms || undefined,
        description: description || undefined,
        category,
      });
      setAmount("");
      setValidity("");
      setData("");
      setTalktime("");
      setSms("");
      setDescription("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not add plan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(p: Plan) {
    await api.patch(`/plans/${p.id}`, { isActive: !p.isActive });
    load();
  }

  async function remove(id: string) {
    await api.delete(`/plans/${id}`);
    load();
  }

  const visiblePlans = filterOperatorId ? plans.filter((p) => p.operator.id === filterOperatorId) : plans;

  return (
    <div>
      <PageHeader
        title="Recharge Plan Catalog"
        subtitle="Plans a user can browse and pick from in the app instead of typing an amount blind."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Plus size={18} />
            </div>
            <div className="text-sm font-semibold text-ink-900">Add Plan</div>
          </div>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FormField label="Operator">
              <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className={inputClasses} required>
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.code})
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Amount">
              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputClasses}
                required
              />
            </FormField>
            <FormField label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClasses}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Validity" hint="e.g. 28 days">
              <input value={validity} onChange={(e) => setValidity(e.target.value)} className={inputClasses} />
            </FormField>
            <FormField label="Data" hint="e.g. 1.5GB/day">
              <input value={data} onChange={(e) => setData(e.target.value)} className={inputClasses} />
            </FormField>
            <FormField label="Talktime">
              <input value={talktime} onChange={(e) => setTalktime(e.target.value)} className={inputClasses} />
            </FormField>
            <FormField label="SMS">
              <input value={sms} onChange={(e) => setSms(e.target.value)} className={inputClasses} />
            </FormField>
            <FormField label="Description" hint="Optional short note shown in the app">
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClasses} />
            </FormField>
            {error && <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}
            <Button type="submit" loading={submitting}>
              {submitting ? "Adding..." : "Add Plan"}
            </Button>
          </form>
        </Card>

        <div>
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm text-ink-500">Filter by operator</span>
            <select
              value={filterOperatorId}
              onChange={(e) => setFilterOperatorId(e.target.value)}
              className={`${compactInputClasses} w-56`}
            >
              <option value="">All operators</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          {loading ? null : visiblePlans.length === 0 ? (
            <Card>
              <EmptyState icon={<Layers size={22} />} message="No plans configured yet." />
            </Card>
          ) : (
            <Table>
              <THead>
                <Th>Operator</Th>
                <Th>Category</Th>
                <Th>Amount</Th>
                <Th>Validity</Th>
                <Th>Data</Th>
                <Th>Talktime</Th>
                <Th>Status</Th>
                <Th />
              </THead>
              <tbody>
                {visiblePlans.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium text-ink-900">{p.operator.name}</Td>
                    <Td>{p.category}</Td>
                    <Td className="font-medium">₹{Number(p.amount).toFixed(2)}</Td>
                    <Td>{p.validity || "-"}</Td>
                    <Td>{p.data || "-"}</Td>
                    <Td>{p.talktime || "-"}</Td>
                    <Td>
                      <button
                        onClick={() => toggle(p)}
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
                      <button onClick={() => remove(p.id)} className="text-ink-400 hover:text-rose-600">
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
