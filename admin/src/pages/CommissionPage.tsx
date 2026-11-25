import { type FormEvent, useEffect, useState } from "react";
import { PackagePlus, Package } from "lucide-react";
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

interface Slab {
  id: string;
  operatorId: string;
  commissionType: "PERCENT" | "FLAT";
  value: string;
  operator: Operator;
}

interface Pack {
  id: string;
  name: string;
  slabs: Slab[];
  globalCommissionType: "PERCENT" | "FLAT" | null;
  globalValue: string | null;
}

function GlobalRateEditor({ pack, onSaved }: { pack: Pack; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(pack.globalCommissionType != null);
  const [commissionType, setCommissionType] = useState<"PERCENT" | "FLAT">(pack.globalCommissionType ?? "PERCENT");
  const [value, setValue] = useState(pack.globalValue ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/commission-slabs/${pack.id}/global-rate`, {
        commissionType: enabled ? commissionType : null,
        value: enabled && value ? Number(value) : null,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-ink-50 px-4 py-3">
      <label className="flex flex-1 items-center gap-2 text-xs font-medium text-ink-600">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 shrink-0" />
        <span>
          <span className="font-semibold text-ink-800">Global fallback rate</span> — used when an operator has no specific slab
        </span>
      </label>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        disabled={!enabled}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Value"
        className={`${compactInputClasses} w-24 disabled:bg-ink-100 disabled:text-ink-400`}
      />
      <select
        value={commissionType}
        disabled={!enabled}
        onChange={(e) => setCommissionType(e.target.value as "PERCENT" | "FLAT")}
        className={`${compactInputClasses} w-24 disabled:bg-ink-100 disabled:text-ink-400`}
      >
        <option value="PERCENT">%</option>
        <option value="FLAT">₹ Flat</option>
      </select>
      <Button type="submit" variant="secondary" loading={saving}>
        Save
      </Button>
    </form>
  );
}

function PackSlabEditor({ pack, operators, onSaved }: { pack: Pack; operators: Operator[]; onSaved: () => void }) {
  const [operatorId, setOperatorId] = useState(operators[0]?.id ?? "");
  const [commissionType, setCommissionType] = useState<"PERCENT" | "FLAT">("PERCENT");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/commission-slabs/${pack.id}/slabs`, {
        operatorId,
        commissionType,
        value: Number(value),
      });
      setValue("");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 border-t border-ink-100 pt-4">
      {pack.slabs.length > 0 && (
        <table className="mb-4 w-full text-left text-sm">
          <tbody>
            {pack.slabs.map((s) => (
              <tr key={s.id} className="border-b border-ink-50 last:border-0">
                <td className="py-1.5 text-ink-700">{s.operator.name}</td>
                <td className="py-1.5 text-ink-500">{s.commissionType}</td>
                <td className="py-1.5 text-right font-medium text-ink-900">
                  {s.commissionType === "PERCENT" ? `${s.value}%` : `₹${s.value}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form className="flex flex-wrap items-center gap-2" onSubmit={handleSave}>
        <select
          value={operatorId}
          onChange={(e) => setOperatorId(e.target.value)}
          className={`${compactInputClasses} min-w-40 flex-1`}
        >
          {operators.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          value={commissionType}
          onChange={(e) => setCommissionType(e.target.value as "PERCENT" | "FLAT")}
          className={`${compactInputClasses} w-20`}
        >
          <option value="PERCENT">%</option>
          <option value="FLAT">₹</option>
        </select>
        <input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Value"
          className={`${compactInputClasses} w-24`}
          required
        />
        <Button type="submit" variant="secondary" loading={saving}>
          Save
        </Button>
      </form>
    </div>
  );
}

interface DistributionRow {
  operatorName: string;
  count: number;
  totalCommission: number;
}

export function CommissionPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [distribution, setDistribution] = useState<DistributionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    Promise.all([
      api.get("/commission-slabs"),
      api.get("/operators"),
      api.get("/commission-slabs/distribution-report"),
    ]).then(([packRes, opRes, distRes]) => {
      setPacks(packRes.data.packs);
      setOperators(opRes.data.operators);
      setDistribution(distRes.data.report);
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function handleCreatePack(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/commission-slabs", { name });
      setName("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not create pack.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Commission Packs"
        subtitle="Bundle per-operator commission rates into a pack, then assign the whole pack to a user."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <PackagePlus size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900">Create Pack</div>
              <div className="text-xs text-ink-500">A named bundle of operator rates</div>
            </div>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleCreatePack}>
            <FormField label="Pack Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} required />
            </FormField>

            {error && <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}

            <Button type="submit" loading={submitting} className="mt-1">
              {submitting ? "Creating..." : "Create Pack"}
            </Button>
          </form>
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
            All Packs
          </h2>
          {loading ? null : packs.length === 0 ? (
            <Card>
              <EmptyState icon={<Package size={22} />} message="No commission packs yet." />
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {packs.map((pack) => (
                <Card key={pack.id} className="p-5">
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-brand-600" />
                    <div className="font-semibold text-ink-900">{pack.name}</div>
                    <span className="ml-auto text-xs text-ink-400">
                      {pack.slabs.length} operator{pack.slabs.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-4 border-t border-ink-100 pt-4">
                    <GlobalRateEditor pack={pack} onSaved={load} />
                  </div>
                  <PackSlabEditor pack={pack} operators={operators} onSaved={load} />
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {distribution.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Commission Distribution
          </h2>
          <Table>
            <THead>
              <Th>Operator</Th>
              <Th>Payouts</Th>
              <Th>Total Commission Paid</Th>
            </THead>
            <tbody>
              {distribution.map((d) => (
                <Tr key={d.operatorName}>
                  <Td className="font-medium text-ink-900">{d.operatorName}</Td>
                  <Td>{d.count}</Td>
                  <Td className="text-emerald-600">₹{d.totalCommission.toFixed(2)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
