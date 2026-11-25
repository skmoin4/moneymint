import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";
import { FormField, compactInputClasses, inputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";
import { errorText } from "../components/txn/types";

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

const SLOTS = [1, 2, 3, 4, 5];

// Stable colour per operator for the logo badge (no operator artwork is stored).
const LOGO_COLOURS = ["#e40000", "#0a3a8c", "#1ab394", "#f8ac59", "#6f42c1", "#23c6c8", "#d63384", "#2f4050"];
function OperatorLogo({ name }: { name: string }) {
  const hash = [...name].reduce((h, c) => h + c.charCodeAt(0), 0);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold text-white"
      style={{ background: LOGO_COLOURS[hash % LOGO_COLOURS.length] }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

const slotBtn = "bg-brand-500 px-2.5 py-[7px] text-[12.5px] text-white hover:bg-brand-600 disabled:opacity-50 border-r border-brand-600 last:border-r-0";

function SlotButtons({ disabled, busy, onClick }: { disabled: boolean; busy: number | null; onClick: (slot: number) => void }) {
  return (
    <div className="flex flex-wrap overflow-hidden rounded-[3px]">
      {SLOTS.map((s) => (
        <button key={s} type="button" disabled={disabled || busy !== null} onClick={() => onClick(s)} className={slotBtn}>
          {busy === s ? "Updating…" : `Update API ${s}`}
        </button>
      ))}
    </div>
  );
}

function ProviderSelect({ value, onChange, providers }: { value: string; onChange: (v: string) => void; providers: Provider[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${compactInputClasses} min-w-44`}>
      <option value="">- Select -</option>
      {providers.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

export function ProviderApiSettingPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [stopAll, setStopAll] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [globalProviderId, setGlobalProviderId] = useState("");
  const [globalBusy, setGlobalBusy] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [typeProviderId, setTypeProviderId] = useState("");
  const [typeBusy, setTypeBusy] = useState<number | null>(null);
  const [fromProviderId, setFromProviderId] = useState("");
  const [toProviderId, setToProviderId] = useState("");
  const [switchBusy, setSwitchBusy] = useState<number | null>(null);

  const [searchType, setSearchType] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchApi, setSearchApi] = useState("");
  const [applied, setApplied] = useState({ type: "", text: "", api: "" });

  const [adding, setAdding] = useState(false);

  function load() {
    Promise.all([api.get("/operators", { params: { withMappings: 1 } }), api.get("/providers"), api.get("/settings/stopAllApiUsers")]).then(
      ([opRes, provRes, settingRes]) => {
        setOperators(opRes.data.operators);
        setProviders(provRes.data.providers);
        setStopAll(settingRes.data.value === "true");
        setLoading(false);
      }
    );
  }

  useEffect(load, []);

  const types = useMemo(() => Array.from(new Set(operators.map((o) => o.type))).sort(), [operators]);

  const visible = operators.filter((o) => {
    if (applied.type && o.type !== applied.type) return false;
    if (applied.text) {
      const q = applied.text.toLowerCase();
      if (!o.name.toLowerCase().includes(q) && !o.code.toLowerCase().includes(q)) return false;
    }
    if (applied.api && !o.apiMappings.some((m) => m.apiProvider.id === applied.api)) return false;
    return true;
  });

  async function guarded(fn: () => Promise<string>) {
    setMessage(null);
    try {
      setMessage({ ok: true, text: await fn() });
      load();
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    }
  }

  async function toggleStopAll() {
    const next = !stopAll;
    if (next && !window.confirm("Stop ALL transactions platform-wide? Every recharge, bill payment, DMT and AEPS request will be rejected.")) return;
    setStopAll(next);
    await api.put("/settings/stopAllApiUsers", { value: next ? "true" : "false" });
  }

  async function globalUpdate(slot: number) {
    setGlobalBusy(slot);
    await guarded(async () => {
      const res = await api.post("/operators/global-api-update", { priority: slot, apiProviderId: globalProviderId });
      return `API ${slot} set for ${res.data.updated} operator(s).`;
    });
    setGlobalBusy(null);
  }

  async function typeUpdate(slot: number) {
    setTypeBusy(slot);
    await guarded(async () => {
      const res = await api.post("/operators/global-api-update", { priority: slot, apiProviderId: typeProviderId, type: typeFilter });
      return `API ${slot} set for ${res.data.updated} ${typeFilter} operator(s).`;
    });
    setTypeBusy(null);
  }

  async function apiSwitch(slot: number) {
    setSwitchBusy(slot);
    await guarded(async () => {
      const res = await api.post("/operators/api-switch", { fromApiProviderId: fromProviderId, toApiProviderId: toProviderId, priority: slot });
      return `Switched API ${slot} on ${res.data.updated} operator(s).`;
    });
    setSwitchBusy(null);
  }

  async function assignSlot(o: Operator, slot: number, apiProviderId: string) {
    const existing = o.apiMappings.find((m) => m.priority === slot);
    await guarded(async () => {
      if (!apiProviderId) {
        // "STOP RECHARGE" = this slot is switched off.
        if (existing) await api.patch(`/operators/mappings/${existing.id}`, { isActive: false });
        return `${o.name}: API ${slot} stopped.`;
      }
      await api.put(`/operators/${o.id}/mappings`, { priority: slot, apiProviderId });
      return `${o.name}: API ${slot} updated.`;
    });
  }

  async function bulkStatus(isActive: boolean) {
    if (!window.confirm(`${isActive ? "Enable" : "Disable"} ALL operators?`)) return;
    await guarded(async () => {
      const res = await api.post("/operators/bulk-status", { isActive });
      return `${res.data.updated} operator(s) ${isActive ? "enabled" : "disabled"}.`;
    });
  }

  async function toggleOperator(o: Operator) {
    await guarded(async () => {
      await api.patch(`/operators/${o.id}`, { isActive: !o.isActive });
      return `${o.name} ${o.isActive ? "disabled" : "enabled"}.`;
    });
  }

  async function deleteOperator(o: Operator) {
    if (!window.confirm(`Delete operator ${o.name}? This can't be undone.`)) return;
    await guarded(async () => {
      await api.delete(`/operators/${o.id}`);
      return `${o.name} deleted.`;
    });
  }

  function search(e: FormEvent) {
    e.preventDefault();
    setApplied({ type: searchType, text: searchText.trim(), api: searchApi });
  }

  return (
    <div>
      <PageHeader title="Provider API Setting" />

      <Panel title="Stop All Api Users" bodyClassName="px-3 py-2.5">
        <label className="flex items-center gap-1.5 text-[12.5px]">
          <input type="checkbox" checked={stopAll} onChange={toggleStopAll} />
          Stop All Api Users
          {stopAll && <span className="ml-2 font-bold text-[#ed5565]">— all transactions are currently being rejected</span>}
        </label>
      </Panel>

      <Panel title="Global API Update" bodyClassName="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <span className="text-[12.5px] font-bold">API:</span>
        <ProviderSelect value={globalProviderId} onChange={setGlobalProviderId} providers={providers} />
        <SlotButtons disabled={!globalProviderId} busy={globalBusy} onClick={globalUpdate} />
      </Panel>

      <Panel title="Set API Provider wise" bodyClassName="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <span className="text-[12.5px] font-bold">Provider Type:</span>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={`${compactInputClasses} min-w-40`}>
          <option value="">- Select -</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="text-[12.5px] font-bold">API:</span>
        <ProviderSelect value={typeProviderId} onChange={setTypeProviderId} providers={providers} />
        <SlotButtons disabled={!typeFilter || !typeProviderId} busy={typeBusy} onClick={typeUpdate} />
      </Panel>

      <Panel title="Api to Api Switch" bodyClassName="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <span className="text-[12.5px] font-bold">From API:</span>
        <ProviderSelect value={fromProviderId} onChange={setFromProviderId} providers={providers} />
        <span className="text-[12.5px] font-bold">To API:</span>
        <ProviderSelect value={toProviderId} onChange={setToProviderId} providers={providers} />
        <SlotButtons disabled={!fromProviderId || !toProviderId || fromProviderId === toProviderId} busy={switchBusy} onClick={apiSwitch} />
      </Panel>

      {message && (
        <div
          className={`mb-4 flex items-center justify-between rounded-sm px-3 py-2 text-[12.5px] ${
            message.ok ? "bg-row-success text-[#3c763d]" : "bg-row-failed text-[#a94442]"
          }`}
        >
          {message.text}
          <button onClick={() => setMessage(null)}>✕</button>
        </div>
      )}

      <h2 className="mb-2 text-[17px] text-ink-800">Operators</h2>
      <form onSubmit={search} className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-bold">Search Operator:</span>
        <select value={searchType} onChange={(e) => setSearchType(e.target.value)} className={`${compactInputClasses} min-w-36`}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="text-ink-500">And</span>
        <input value={searchText} onChange={(e) => setSearchText(e.target.value)} className={`${compactInputClasses} w-44`} placeholder="Name or code" />
        <span className="text-ink-500">Or</span>
        <ProviderSelect value={searchApi} onChange={setSearchApi} providers={providers} />
        <button type="submit" className="rounded-[3px] bg-brand-500 px-3 py-[6px] text-white hover:bg-brand-600">
          Search
        </button>
        <button type="button" onClick={() => bulkStatus(true)} className="rounded-[3px] border border-ink-200 bg-ink-50 px-2.5 py-[5px] hover:bg-ink-100">
          Enable All Operators
        </button>
        <button type="button" onClick={() => bulkStatus(false)} className="rounded-[3px] border border-ink-200 bg-ink-50 px-2.5 py-[5px] hover:bg-ink-100">
          Disable All Operators
        </button>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="ml-auto rounded-[3px] bg-brand-500 px-3 py-[6px] text-white hover:bg-brand-600"
        >
          Add Operator
        </button>
      </form>

      {loading ? null : (
        <Table>
          <THead>
            <Th>S#</Th>
            <Th />
            <Th>Code</Th>
            <Th>Logo</Th>
            <Th>Provider</Th>
            <Th>providertype</Th>
            {SLOTS.map((s) => (
              <Th key={s}>API {s}</Th>
            ))}
            <Th>Status</Th>
            <Th>Delete</Th>
          </THead>
          <tbody>
            {visible.length === 0 ? (
              <Tr>
                <Td colSpan={13} className="py-8 text-center text-ink-400">
                  No operators match this search.
                </Td>
              </Tr>
            ) : (
              visible.map((o, i) => (
                <Tr key={o.id}>
                  <Td>{i + 1}</Td>
                  <Td>
                    <Link to={`/operators/${o.id}`} className="text-[#337ab7] hover:underline">
                      Edit
                    </Link>
                  </Td>
                  <Td className="font-mono">{o.code}</Td>
                  <Td>
                    <OperatorLogo name={o.name} />
                  </Td>
                  <Td>{o.name}</Td>
                  <Td className="capitalize">{o.type.toLowerCase()}</Td>
                  {SLOTS.map((s) => {
                    const m = o.apiMappings.find((x) => x.priority === s);
                    const value = m && m.isActive ? m.apiProvider.id : "";
                    return (
                      <Td key={s}>
                        <select
                          value={value}
                          onChange={(e) => assignSlot(o, s, e.target.value)}
                          className={`w-32 border-0 bg-transparent py-0.5 text-[12px] uppercase outline-none focus:ring-1 focus:ring-brand-500 ${
                            value ? "text-ink-800" : "text-ink-400"
                          }`}
                          aria-label={`${o.name} API ${s}`}
                        >
                          <option value="">STOP RECHARGE</option>
                          {providers.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </Td>
                    );
                  })}
                  <Td>
                    <button
                      onClick={() => toggleOperator(o)}
                      className={`rounded-[3px] px-2 py-[2px] text-[11px] font-semibold text-white ${o.isActive ? "bg-brand-500" : "bg-ink-400"}`}
                    >
                      {o.isActive ? "Enabled" : "Disabled"}
                    </button>
                  </Td>
                  <Td>
                    <button
                      onClick={() => deleteOperator(o)}
                      className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-[#ed5565] text-white hover:bg-[#da4453]"
                      aria-label={`Delete ${o.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      )}

      {adding && (
        <AddOperatorModal
          types={types}
          onClose={() => setAdding(false)}
          onSaved={(name) => {
            setAdding(false);
            setMessage({ ok: true, text: `${name} added. Assign its APIs in the table below.` });
            load();
          }}
        />
      )}
    </div>
  );
}

function AddOperatorModal({ types, onClose, onSaved }: { types: string[]; onClose: () => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState(types[0] ?? "PREPAID");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/operators", { name: name.trim(), code: code.trim(), type: type.trim().toUpperCase() });
      onSaved(name.trim());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add Operator" onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <FormField label="Operator name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} required minLength={2} placeholder="e.g. Jio Express" />
        </FormField>
        <FormField label="Code (SMS code)" hint="Short unique code, used in API requests and SMS — e.g. JIOX">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={inputClasses} required minLength={2} />
        </FormField>
        <FormField label="Provider type">
          <input value={type} onChange={(e) => setType(e.target.value)} list="operator-types" className={inputClasses} required />
          <datalist id="operator-types">
            {types.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </FormField>
        {error && <div className="rounded-sm bg-row-failed px-3 py-2 text-[12.5px] text-[#a94442]">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
