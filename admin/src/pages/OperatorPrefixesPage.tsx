import { type FormEvent, useEffect, useState } from "react";
import { Hash, Plus, Trash2 } from "lucide-react";
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

interface Prefix {
  id: string;
  prefix: string;
  operator: Operator;
}

export function OperatorPrefixesPage() {
  const [prefixes, setPrefixes] = useState<Prefix[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefix, setPrefix] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    Promise.all([api.get("/operators/prefixes"), api.get("/operators")]).then(([pRes, oRes]) => {
      setPrefixes(pRes.data.prefixes);
      setOperators(oRes.data.operators);
      setOperatorId((prev) => prev || oRes.data.operators[0]?.id || "");
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!operatorId) return;
    setSubmitting(true);
    try {
      await api.post("/operators/prefixes", { prefix: prefix.trim(), operatorId });
      setPrefix("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not add prefix.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    await api.delete(`/operators/prefixes/${id}`);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Operator Prefix Detection"
        subtitle="Digit prefixes used to auto-detect an operator from a mobile number in the app. Heuristic only — numbers can be ported."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Plus size={18} />
            </div>
            <div className="text-sm font-semibold text-ink-900">Add Prefix</div>
          </div>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FormField label="Prefix" hint="Digits only, e.g. 981, 70">
              <input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.replace(/\D/g, ""))}
                className={inputClasses}
                maxLength={6}
                required
              />
            </FormField>
            <FormField label="Operator">
              <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className={inputClasses} required>
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.code})
                  </option>
                ))}
              </select>
            </FormField>
            {error && <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}
            <Button type="submit" loading={submitting}>
              {submitting ? "Adding..." : "Add Prefix"}
            </Button>
          </form>
        </Card>

        <div>
          {loading ? null : prefixes.length === 0 ? (
            <Card>
              <EmptyState icon={<Hash size={22} />} message="No prefixes configured yet." />
            </Card>
          ) : (
            <Table>
              <THead>
                <Th>Prefix</Th>
                <Th>Operator</Th>
                <Th />
              </THead>
              <tbody>
                {prefixes.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-mono font-medium text-ink-900">{p.prefix}</Td>
                    <Td>
                      {p.operator.name}{" "}
                      <span className="text-ink-400">({p.operator.code})</span>
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
