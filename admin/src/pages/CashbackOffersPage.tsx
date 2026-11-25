import { type FormEvent, useEffect, useState } from "react";
import { Gift, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField, inputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

interface Operator {
  id: string;
  name: string;
  code: string;
}

interface Offer {
  id: string;
  name: string;
  operator: Operator | null;
  minAmount: string;
  percent: string;
  maxCashback: string | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
}

export function CashbackOffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [percent, setPercent] = useState("");
  const [maxCashback, setMaxCashback] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");

  function load() {
    setLoading(true);
    Promise.all([api.get("/cashback-offers"), api.get("/operators")]).then(([cRes, oRes]) => {
      setOffers(cRes.data.offers);
      setOperators(oRes.data.operators);
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name || !percent) return;
    setSubmitting(true);
    try {
      await api.post("/cashback-offers", {
        name,
        operatorId: operatorId || undefined,
        minAmount: minAmount ? Number(minAmount) : undefined,
        percent: Number(percent),
        maxCashback: maxCashback ? Number(maxCashback) : undefined,
        validFrom: validFrom || undefined,
        validTo: validTo || undefined,
      });
      setName("");
      setOperatorId("");
      setMinAmount("");
      setPercent("");
      setMaxCashback("");
      setValidFrom("");
      setValidTo("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not create offer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(o: Offer) {
    await api.patch(`/cashback-offers/${o.id}`, { isActive: !o.isActive });
    load();
  }

  async function remove(id: string) {
    await api.delete(`/cashback-offers/${id}`);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Cashback Offers"
        subtitle="Promotional campaigns credited automatically on top of commission when a matching transaction settles successfully."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Plus size={18} />
            </div>
            <div className="text-sm font-semibold text-ink-900">New Offer</div>
          </div>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FormField label="Offer Name" hint="e.g. 5% back on Jio recharges">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} required />
            </FormField>
            <FormField label="Operator" hint="Leave blank to apply platform-wide">
              <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className={inputClasses}>
                <option value="">All operators</option>
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.code})
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Cashback %">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className={inputClasses}
                required
              />
            </FormField>
            <FormField label="Minimum Amount" hint="Transaction must be at least this much">
              <input
                type="number"
                min="0"
                step="0.01"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className={inputClasses}
              />
            </FormField>
            <FormField label="Max Cashback Cap" hint="Optional ceiling per transaction">
              <input
                type="number"
                min="0"
                step="0.01"
                value={maxCashback}
                onChange={(e) => setMaxCashback(e.target.value)}
                className={inputClasses}
              />
            </FormField>
            <FormField label="Valid From" hint="Optional">
              <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className={inputClasses} />
            </FormField>
            <FormField label="Valid To" hint="Optional">
              <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} className={inputClasses} />
            </FormField>
            {error && <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}
            <Button type="submit" loading={submitting}>
              {submitting ? "Creating..." : "Create Offer"}
            </Button>
          </form>
        </Card>

        <div>
          {loading ? null : offers.length === 0 ? (
            <Card>
              <EmptyState icon={<Gift size={22} />} message="No cashback offers configured yet." />
            </Card>
          ) : (
            <Table>
              <THead>
                <Th>Name</Th>
                <Th>Operator</Th>
                <Th>Min Amount</Th>
                <Th>%</Th>
                <Th>Cap</Th>
                <Th>Validity</Th>
                <Th>Status</Th>
                <Th />
              </THead>
              <tbody>
                {offers.map((o) => (
                  <Tr key={o.id}>
                    <Td className="font-medium text-ink-900">{o.name}</Td>
                    <Td>{o.operator ? `${o.operator.name} (${o.operator.code})` : "All operators"}</Td>
                    <Td>₹{Number(o.minAmount).toFixed(2)}</Td>
                    <Td>{Number(o.percent)}%</Td>
                    <Td>{o.maxCashback ? `₹${Number(o.maxCashback).toFixed(2)}` : "-"}</Td>
                    <Td>
                      {o.validFrom || o.validTo
                        ? `${o.validFrom ? new Date(o.validFrom).toLocaleDateString() : "—"} to ${
                            o.validTo ? new Date(o.validTo).toLocaleDateString() : "—"
                          }`
                        : "Always"}
                    </Td>
                    <Td>
                      <button
                        onClick={() => toggle(o)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${
                          o.isActive
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 hover:bg-emerald-100"
                            : "bg-ink-100 text-ink-500 ring-ink-500/20 hover:bg-ink-200"
                        }`}
                      >
                        {o.isActive ? "Active" : "Inactive"}
                      </button>
                    </Td>
                    <Td className="text-right">
                      <button onClick={() => remove(o.id)} className="text-ink-400 hover:text-rose-600">
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
