import { type FormEvent, useEffect, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField, inputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

interface Circle {
  id: string;
  name: string;
  code: string;
  state: string;
  isActive: boolean;
}

export function CirclesPage() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    api.get("/circles").then((res) => {
      setCircles(res.data.circles);
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/circles", { name, code, state });
      setName("");
      setCode("");
      setState("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not add circle.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(c: Circle) {
    await api.patch(`/circles/${c.id}`, { isActive: !c.isActive });
    load();
  }

  return (
    <div>
      <PageHeader title="Circle Master" subtitle="Telecom circles used for regional operator routing." />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Plus size={18} />
            </div>
            <div className="text-sm font-semibold text-ink-900">Add Circle</div>
          </div>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FormField label="Circle Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} required />
            </FormField>
            <FormField label="Code">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={inputClasses} required />
            </FormField>
            <FormField label="State">
              <input value={state} onChange={(e) => setState(e.target.value)} className={inputClasses} required />
            </FormField>
            {error && <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}
            <Button type="submit" loading={submitting}>
              {submitting ? "Adding..." : "Add Circle"}
            </Button>
          </form>
        </Card>

        <div>
          {loading ? null : circles.length === 0 ? (
            <Card>
              <EmptyState icon={<MapPin size={22} />} message="No circles added yet." />
            </Card>
          ) : (
            <Table>
              <THead>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>State</Th>
                <Th>Status</Th>
              </THead>
              <tbody>
                {circles.map((c) => (
                  <Tr key={c.id}>
                    <Td className="font-medium text-ink-900">{c.name}</Td>
                    <Td className="font-mono text-xs text-ink-500">{c.code}</Td>
                    <Td>{c.state}</Td>
                    <Td>
                      <button
                        onClick={() => toggle(c)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${
                          c.isActive
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 hover:bg-emerald-100"
                            : "bg-ink-100 text-ink-500 ring-ink-500/20 hover:bg-ink-200"
                        }`}
                      >
                        {c.isActive ? "Active" : "Inactive"}
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
