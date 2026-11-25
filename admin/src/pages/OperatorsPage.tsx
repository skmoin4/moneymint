import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Radio, ChevronRight } from "lucide-react";
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
  type: string;
}

export function OperatorsPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState("PREPAID");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    api.get("/operators").then((res) => {
      setOperators(res.data.operators);
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/operators", { name, code, type });
      setName("");
      setCode("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not create operator.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Operators"
        subtitle="Telecom and utility operators, each routed through one or more providers."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Radio size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900">Add Operator</div>
              <div className="text-xs text-ink-500">Register a new billing operator</div>
            </div>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FormField label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} required />
            </FormField>
            <FormField label="Code" hint="Unique short code, e.g. AIRTEL">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={inputClasses} required />
            </FormField>
            <FormField label="Type">
              <select value={type} onChange={(e) => setType(e.target.value)} className={inputClasses}>
                <option value="PREPAID">Prepaid</option>
                <option value="POSTPAID">Postpaid</option>
                <option value="DTH">DTH</option>
                <option value="ELECTRICITY">Electricity</option>
              </select>
            </FormField>

            {error && <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}

            <Button type="submit" loading={submitting} className="mt-1">
              {submitting ? "Adding..." : "Add Operator"}
            </Button>
          </form>
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
            All Operators
          </h2>
          {loading ? null : operators.length === 0 ? (
            <Card>
              <EmptyState icon={<Radio size={22} />} message="No operators yet." />
            </Card>
          ) : (
            <Table>
              <THead>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Type</Th>
                <Th />
              </THead>
              <tbody>
                {operators.map((o) => (
                  <Tr key={o.id}>
                    <Td className="font-medium text-ink-900">{o.name}</Td>
                    <Td className="font-mono text-xs text-ink-500">{o.code}</Td>
                    <Td className="text-ink-500">{o.type}</Td>
                    <Td className="text-right">
                      <Link
                        to={`/operators/${o.id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                      >
                        Manage routing <ChevronRight size={14} />
                      </Link>
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
