import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { OctagonAlert, RefreshCw, Shuffle, ChevronRight, Filter } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { FormField, compactInputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

interface Provider {
  id: string;
  name: string;
  code: string;
}

interface Mapping {
  id: string;
  priority: number;
  isActive: boolean;
  apiProvider: Provider;
}

interface Operator {
  id: string;
  name: string;
  code: string;
  type: string;
  isActive: boolean;
  apiMappings: Mapping[];
}

const PRIORITY_SLOTS = [1, 2, 3, 4, 5];

function operatorTypes(operators: Operator[]) {
  return Array.from(new Set(operators.map((o) => o.type))).sort();
}

export function ProviderApiSettingPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [stopAll, setStopAll] = useState(false);

  const [globalProviderId, setGlobalProviderId] = useState("");
  const [globalBusySlot, setGlobalBusySlot] = useState<number | null>(null);

  const [typeFilter, setTypeFilter] = useState("");
  const [typeProviderId, setTypeProviderId] = useState("");
  const [typeBusySlot, setTypeBusySlot] = useState<number | null>(null);

  const [fromProviderId, setFromProviderId] = useState("");
  const [toProviderId, setToProviderId] = useState("");
  const [switching, setSwitching] = useState(false);
  const [message, setMessage] = useState("");

  function load() {
    setLoading(true);
    Promise.all([
      api.get("/operators", { params: { withMappings: 1 } }),
      api.get("/providers"),
      api.get("/settings/stopAllApiUsers"),
    ]).then(([opRes, provRes, settingRes]) => {
      setOperators(opRes.data.operators);
      setProviders(provRes.data.providers);
      setStopAll(settingRes.data.value === "true");
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function toggleStopAll() {
    const next = !stopAll;
    setStopAll(next);
    await api.put("/settings/stopAllApiUsers", { value: next ? "true" : "false" });
  }

  async function runGlobalUpdate(priority: number) {
    if (!globalProviderId) return;
    setGlobalBusySlot(priority);
    setMessage("");
    try {
      const res = await api.post("/operators/global-api-update", { priority, apiProviderId: globalProviderId });
      setMessage(`API ${priority} updated for ${res.data.updated} operators.`);
      load();
    } finally {
      setGlobalBusySlot(null);
    }
  }

  async function runTypeUpdate(priority: number) {
    if (!typeProviderId || !typeFilter) return;
    setTypeBusySlot(priority);
    setMessage("");
    try {
      const res = await api.post("/operators/global-api-update", {
        priority,
        apiProviderId: typeProviderId,
        type: typeFilter,
      });
      setMessage(`API ${priority} updated for ${res.data.updated} ${typeFilter} operator(s).`);
      load();
    } finally {
      setTypeBusySlot(null);
    }
  }

  async function runSwitch() {
    if (!fromProviderId || !toProviderId) return;
    setSwitching(true);
    setMessage("");
    try {
      const res = await api.post("/operators/api-switch", {
        fromApiProviderId: fromProviderId,
        toApiProviderId: toProviderId,
      });
      setMessage(`Switched ${res.data.updated} mapping(s) across all operators.`);
      load();
    } finally {
      setSwitching(false);
    }
  }

  async function bulkStatus(isActive: boolean) {
    await api.post("/operators/bulk-status", { isActive });
    load();
  }

  async function toggleOperator(o: Operator) {
    await api.patch(`/operators/${o.id}`, { isActive: !o.isActive });
    load();
  }

  async function assignSlot(operatorId: string, priority: number, apiProviderId: string, existingMapping?: Mapping) {
    if (!apiProviderId) {
      // "STOP RECHARGE" selected: deactivate the existing slot rather than silently ignoring it.
      if (existingMapping) {
        await api.patch(`/operators/mappings/${existingMapping.id}`, { isActive: false });
        load();
      }
      return;
    }
    await api.put(`/operators/${operatorId}/mappings`, { priority, apiProviderId });
    load();
  }

  async function toggleSlot(mapping: Mapping) {
    await api.patch(`/operators/mappings/${mapping.id}`, { isActive: !mapping.isActive });
    load();
  }

  return (
    <div>
      <PageHeader
        title="Provider API Setting"
        subtitle="Configure failover routing for every operator, in bulk, from one screen."
      />

      <div className="flex flex-col gap-6">
        <Card className="p-6">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <OctagonAlert size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900">Stop All API Users</div>
              <div className="text-xs text-ink-500">
                Instantly blocks every recharge/BBPS/DMT/AEPS transaction platform-wide.
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
            <input type="checkbox" checked={stopAll} onChange={toggleStopAll} className="h-4 w-4" />
            {stopAll ? "Stopped — all transactions are being rejected" : "Running normally"}
          </label>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <RefreshCw size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900">Global API Update</div>
              <div className="text-xs text-ink-500">
                Assign one provider to a slot across every operator at once.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Provider">
              <select
                value={globalProviderId}
                onChange={(e) => setGlobalProviderId(e.target.value)}
                className={`${compactInputClasses} min-w-55`}
              >
                <option value="">- Select -</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </FormField>
            {PRIORITY_SLOTS.map((slot) => (
              <Button
                key={slot}
                variant="secondary"
                disabled={!globalProviderId}
                loading={globalBusySlot === slot}
                onClick={() => runGlobalUpdate(slot)}
              >
                Update API {slot}
              </Button>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Filter size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900">Set API Provider Wise</div>
              <div className="text-xs text-ink-500">
                Same bulk assignment, but scoped to just one operator type (e.g. only AEPS) instead of every operator.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Provider Type">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className={`${compactInputClasses} min-w-40`}
              >
                <option value="">- Select -</option>
                {operatorTypes(operators).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Provider">
              <select
                value={typeProviderId}
                onChange={(e) => setTypeProviderId(e.target.value)}
                className={`${compactInputClasses} min-w-55`}
              >
                <option value="">- Select -</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </FormField>
            {PRIORITY_SLOTS.map((slot) => (
              <Button
                key={slot}
                variant="secondary"
                disabled={!typeProviderId || !typeFilter}
                loading={typeBusySlot === slot}
                onClick={() => runTypeUpdate(slot)}
              >
                Update API {slot}
              </Button>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Shuffle size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900">Api to Api Switch</div>
              <div className="text-xs text-ink-500">
                Replace one provider with another everywhere it's currently assigned (any slot, any operator).
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="From API">
              <select
                value={fromProviderId}
                onChange={(e) => setFromProviderId(e.target.value)}
                className={`${compactInputClasses} min-w-50`}
              >
                <option value="">- Select -</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="To API">
              <select
                value={toProviderId}
                onChange={(e) => setToProviderId(e.target.value)}
                className={`${compactInputClasses} min-w-50`}
              >
                <option value="">- Select -</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </FormField>
            <Button
              variant="secondary"
              disabled={!fromProviderId || !toProviderId}
              loading={switching}
              onClick={runSwitch}
            >
              Switch
            </Button>
          </div>
        </Card>

        {message && (
          <div className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
            {message}
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Operators</h2>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => bulkStatus(true)}>
                Enable All Operators
              </Button>
              <Button variant="secondary" onClick={() => bulkStatus(false)}>
                Disable All Operators
              </Button>
            </div>
          </div>

          {loading ? null : (
            <Table>
              <THead>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Type</Th>
                {PRIORITY_SLOTS.map((s) => (
                  <Th key={s}>API {s}</Th>
                ))}
                <Th>Status</Th>
                <Th />
              </THead>
              <tbody>
                {operators.map((o) => (
                  <Tr key={o.id}>
                    <Td className="font-medium text-ink-900">{o.name}</Td>
                    <Td className="font-mono text-xs text-ink-500">{o.code}</Td>
                    <Td className="text-ink-500">{o.type}</Td>
                    {PRIORITY_SLOTS.map((s) => {
                      const m = o.apiMappings.find((x) => x.priority === s);
                      return (
                        <Td key={s} className="text-ink-500">
                          <div className="flex items-center gap-1">
                            <select
                              value={m?.apiProvider.id ?? ""}
                              onChange={(e) => assignSlot(o.id, s, e.target.value, m)}
                              className="w-28 rounded border border-ink-200 bg-white px-1 py-1 text-[11px] outline-none focus:border-brand-500"
                            >
                              <option value="">STOP RECHARGE</option>
                              {providers.map((p) => (
                                <option key={p.id} value={p.id}>{p.code}</option>
                              ))}
                            </select>
                            {m && (
                              <button
                                onClick={() => toggleSlot(m)}
                                title={m.isActive ? "Active — click to disable" : "Disabled — click to enable"}
                                className={`h-2.5 w-2.5 shrink-0 rounded-full ${m.isActive ? "bg-emerald-500" : "bg-ink-300"}`}
                              />
                            )}
                          </div>
                        </Td>
                      );
                    })}
                    <Td>
                      <button
                        onClick={() => toggleOperator(o)}
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
                      <Link
                        to={`/operators/${o.id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                      >
                        Manage <ChevronRight size={14} />
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
