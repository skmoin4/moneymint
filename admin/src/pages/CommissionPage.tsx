import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { FormField, compactInputClasses, inputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";
import { errorText } from "../components/txn/types";
import { rangeLabel, rateLabel } from "../components/commission/format";

interface Operator {
  id: string;
  name: string;
  code: string;
  type: string;
}

interface Slab {
  id: string;
  operatorId: string;
  chargeType: "COMMISSION" | "SURCHARGE";
  commissionType: "PERCENT" | "FLAT";
  value: string;
  minAmount: string | null;
  maxAmount: string | null;
}

interface Pack {
  id: string;
  name: string;
  globalCommissionType: "PERCENT" | "FLAT" | null;
  globalValue: string | null;
  slabs: Slab[];
  _count: { users: number };
}

interface SlabDraft {
  id?: string;
  operatorId: string;
  chargeType: "COMMISSION" | "SURCHARGE";
  commissionType: "PERCENT" | "FLAT";
  value: string;
  minAmount: string;
  maxAmount: string;
}

export function CommissionPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [bulk, setBulk] = useState({ operatorType: "", chargeType: "COMMISSION", commissionType: "PERCENT", value: "" });
  const [draft, setDraft] = useState<SlabDraft | null>(null);
  const [tds, setTds] = useState("");

  function load() {
    return Promise.all([api.get("/commission-slabs"), api.get("/operators"), api.get("/settings/commissionTdsPercent")]).then(([p, o, t]) => {
      setPacks(p.data.packs);
      setOperators(o.data.operators);
      setTds(t.data.value ?? "0");
      setSelectedId((cur) => cur || p.data.packs[0]?.id || "");
    });
  }

  useEffect(() => {
    load();
  }, []);

  const pack = packs.find((p) => p.id === selectedId) ?? null;
  const types = useMemo(() => Array.from(new Set(operators.map((o) => o.type))).sort(), [operators]);
  const visibleOps = operators.filter((o) => !typeFilter || o.type === typeFilter);

  async function guarded(fn: () => Promise<string>) {
    setMessage(null);
    try {
      setMessage({ ok: true, text: await fn() });
      await load();
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    }
  }

  function createPack(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    guarded(async () => {
      const res = await api.post("/commission-slabs", { name: newName.trim() });
      setSelectedId(res.data.pack.id);
      setNewName("");
      return `Pack "${res.data.pack.name}" created.`;
    });
  }

  function clonePack() {
    if (!pack) return;
    const name = window.prompt(`Name for the copy of "${pack.name}"`, `${pack.name} copy`);
    if (!name?.trim()) return;
    guarded(async () => {
      const res = await api.post(`/commission-slabs/${pack.id}/clone`, { name: name.trim() });
      setSelectedId(res.data.pack.id);
      return `Copied to "${name.trim()}".`;
    });
  }

  function deletePack() {
    if (!pack || !window.confirm(`Delete pack "${pack.name}"?`)) return;
    guarded(async () => {
      await api.delete(`/commission-slabs/${pack.id}`);
      setSelectedId("");
      return "Pack deleted.";
    });
  }

  function applyBulk(e: FormEvent) {
    e.preventDefault();
    if (!pack || !bulk.operatorType || bulk.value === "") return;
    guarded(async () => {
      const res = await api.post(`/commission-slabs/${pack.id}/bulk`, { ...bulk, value: Number(bulk.value) });
      return `Set for ${res.data.updated} ${bulk.operatorType} operator(s).`;
    });
  }

  function saveGlobal(type: string, value: string) {
    if (!pack) return;
    guarded(async () => {
      await api.put(`/commission-slabs/${pack.id}/global-rate`, {
        commissionType: type || null,
        value: type && value !== "" ? Number(value) : null,
      });
      return "Fallback rate saved.";
    });
  }

  function saveTds() {
    guarded(async () => {
      const v = Number(tds);
      if (isNaN(v) || v < 0 || v > 100) throw { response: { data: { error: "TDS must be between 0 and 100" } } };
      await api.put("/settings/commissionTdsPercent", { value: String(v) });
      return `TDS set to ${v}% on every commission payout.`;
    });
  }

  function saveSlab(e: FormEvent) {
    e.preventDefault();
    if (!pack || !draft) return;
    const body = {
      operatorId: draft.operatorId,
      chargeType: draft.chargeType,
      commissionType: draft.commissionType,
      value: Number(draft.value),
      minAmount: draft.minAmount === "" ? null : Number(draft.minAmount),
      maxAmount: draft.maxAmount === "" ? null : Number(draft.maxAmount),
    };
    guarded(async () => {
      if (draft.id) await api.patch(`/commission-slabs/${pack.id}/slabs/${draft.id}`, body);
      else await api.post(`/commission-slabs/${pack.id}/slabs`, body);
      setDraft(null);
      return "Slab saved.";
    });
  }

  function deleteSlab(s: Slab) {
    if (!pack || !window.confirm("Delete this slab?")) return;
    guarded(async () => {
      await api.delete(`/commission-slabs/${pack.id}/slabs/${s.id}`);
      return "Slab deleted.";
    });
  }

  const opName = (id: string) => operators.find((o) => o.id === id)?.name ?? "";

  return (
    <div>
      <PageHeader title="Commission Packs" />

      {message && (
        <div className={`mb-4 rounded-sm px-3 py-2 text-[12.5px] ${message.ok ? "bg-row-success text-[#3c763d]" : "bg-row-failed text-[#a94442]"}`}>{message.text}</div>
      )}

      <div className="mb-4 rounded-sm border border-ink-200 bg-white px-4 py-3 text-[12.5px] text-ink-600">
        How it works: every user gets a pack. The user earns their pack's rate; each Distributor / Master Distributor above them earns
        <b> their own rate minus the rate below them</b>. Example on Jio ₹300 — Retailer 2% (₹6), Distributor 2.5% (₹1.50), MD 2.8% (₹0.90).
        A surcharge is charged to the user on top of the amount; uplines with a lower surcharge keep the difference. The platform keeps the
        vendor's margin minus all payouts.
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <div>
          <Panel title="Packs" bodyClassName="p-0">
            <ul>
              {packs.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setSelectedId(p.id)}
                    className={`flex w-full items-center justify-between border-b border-ink-100 px-3 py-2 text-left ${
                      p.id === selectedId ? "bg-brand-50 font-bold text-brand-700" : "hover:bg-ink-50"
                    }`}
                  >
                    <span>{p.name}</span>
                    <span className="text-[11px] text-ink-400">{p._count.users} user(s)</span>
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={createPack} className="flex gap-1 p-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New pack name" className={`${compactInputClasses} min-w-0 flex-1`} />
              <Button size="sm" type="submit">
                <Plus size={12} /> Add
              </Button>
            </form>
          </Panel>

          <Panel title="TDS on commission" bodyClassName="flex items-center gap-2 p-3">
            <input value={tds} onChange={(e) => setTds(e.target.value)} inputMode="decimal" className={`${compactInputClasses} w-20`} aria-label="TDS percent" />
            <span>%</span>
            <Button size="sm" onClick={saveTds}>
              Save
            </Button>
          </Panel>
        </div>

        {pack && (
          <div className="min-w-0">
            <Panel
              title={pack.name}
              action={
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={clonePack}>
                    <Copy size={12} /> Copy pack
                  </Button>
                  <Button size="sm" variant="danger" onClick={deletePack}>
                    <Trash2 size={12} /> Delete
                  </Button>
                </div>
              }
              bodyClassName="flex flex-col gap-3 p-3"
            >
              <form onSubmit={applyBulk} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="font-bold">Set for all</span>
                <select value={bulk.operatorType} onChange={(e) => setBulk({ ...bulk, operatorType: e.target.value })} className={compactInputClasses} aria-label="Operator type">
                  <option value="">operator type…</option>
                  {types.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <select value={bulk.chargeType} onChange={(e) => setBulk({ ...bulk, chargeType: e.target.value })} className={compactInputClasses} aria-label="Charge type">
                  <option value="COMMISSION">Commission</option>
                  <option value="SURCHARGE">Surcharge</option>
                </select>
                <input value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} inputMode="decimal" placeholder="value" className={`${compactInputClasses} w-20`} aria-label="Value" />
                <select value={bulk.commissionType} onChange={(e) => setBulk({ ...bulk, commissionType: e.target.value })} className={compactInputClasses} aria-label="Percent or flat">
                  <option value="PERCENT">%</option>
                  <option value="FLAT">₹ flat</option>
                </select>
                <Button size="sm" type="submit" disabled={!bulk.operatorType || bulk.value === ""}>
                  Apply
                </Button>
                <span className="text-ink-400">(replaces the "any amount" slab of each; ranged slabs stay)</span>
              </form>
              <GlobalRate pack={pack} onSave={saveGlobal} />
            </Panel>

            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-bold">Show:</span>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={compactInputClasses}>
                <option value="">All operator types</option>
                {types.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>

            <Table>
              <THead>
                <Th>Operator</Th>
                <Th>Type</Th>
                <Th>Amount range</Th>
                <Th>Rate</Th>
                <Th className="w-28" />
              </THead>
              <tbody>
                {visibleOps.map((o) => {
                  const slabs = pack.slabs.filter((s) => s.operatorId === o.id);
                  const add = () =>
                    setDraft({ operatorId: o.id, chargeType: o.type === "DMT" ? "SURCHARGE" : "COMMISSION", commissionType: "PERCENT", value: "", minAmount: "", maxAmount: "" });
                  if (slabs.length === 0) {
                    return (
                      <Tr key={o.id}>
                        <Td>{o.name}</Td>
                        <Td className="capitalize">{o.type.toLowerCase()}</Td>
                        <Td className="text-ink-400" colSpan={2}>
                          {pack.globalCommissionType ? `Fallback: ${rateLabel({ chargeType: "COMMISSION", commissionType: pack.globalCommissionType, value: pack.globalValue ?? "0" })}` : "No rate — earns nothing"}
                        </Td>
                        <Td>
                          <button onClick={add} className="text-[#337ab7] hover:underline">
                            + Add slab
                          </button>
                        </Td>
                      </Tr>
                    );
                  }
                  return slabs.map((s, i) => (
                    <Tr key={s.id}>
                      <Td>{i === 0 ? o.name : ""}</Td>
                      <Td className="capitalize">{i === 0 ? o.type.toLowerCase() : ""}</Td>
                      <Td>{rangeLabel(s)}</Td>
                      <Td className={s.chargeType === "SURCHARGE" ? "font-semibold text-[#ed5565]" : "font-semibold text-brand-700"}>{rateLabel(s)}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setDraft({
                                id: s.id,
                                operatorId: s.operatorId,
                                chargeType: s.chargeType,
                                commissionType: s.commissionType,
                                value: String(Number(s.value)),
                                minAmount: s.minAmount === null ? "" : String(Number(s.minAmount)),
                                maxAmount: s.maxAmount === null ? "" : String(Number(s.maxAmount)),
                              })
                            }
                            className="text-ink-500 hover:text-ink-800"
                            aria-label="Edit slab"
                          >
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteSlab(s)} className="text-[#ed5565]" aria-label="Delete slab">
                            <Trash2 size={13} />
                          </button>
                          {i === slabs.length - 1 && (
                            <button onClick={add} className="text-[12px] text-[#337ab7] hover:underline">
                              + slab
                            </button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ));
                })}
              </tbody>
            </Table>
          </div>
        )}
      </div>

      {draft && (
        <Modal title={`${draft.id ? "Edit" : "Add"} slab — ${opName(draft.operatorId)}`} onClose={() => setDraft(null)}>
          <form onSubmit={saveSlab} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Kind">
                <select value={draft.chargeType} onChange={(e) => setDraft({ ...draft, chargeType: e.target.value as SlabDraft["chargeType"] })} className={inputClasses}>
                  <option value="COMMISSION">Commission (paid to user)</option>
                  <option value="SURCHARGE">Surcharge (charged to user)</option>
                </select>
              </FormField>
              <FormField label="Percent or flat">
                <select value={draft.commissionType} onChange={(e) => setDraft({ ...draft, commissionType: e.target.value as SlabDraft["commissionType"] })} className={inputClasses}>
                  <option value="PERCENT">% of amount</option>
                  <option value="FLAT">₹ flat</option>
                </select>
              </FormField>
            </div>
            <FormField label="Value">
              <input value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} inputMode="decimal" required className={inputClasses} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="From amount (₹)" hint="Blank = no minimum">
                <input value={draft.minAmount} onChange={(e) => setDraft({ ...draft, minAmount: e.target.value })} inputMode="decimal" className={inputClasses} />
              </FormField>
              <FormField label="To amount (₹)" hint="Blank = no maximum">
                <input value={draft.maxAmount} onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value })} inputMode="decimal" className={inputClasses} />
              </FormField>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={draft.value === ""}>
                Save
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function GlobalRate({ pack, onSave }: { pack: Pack; onSave: (type: string, value: string) => void }) {
  const [type, setType] = useState(pack.globalCommissionType ?? "");
  const [value, setValue] = useState(pack.globalValue === null ? "" : String(Number(pack.globalValue)));
  useEffect(() => {
    setType(pack.globalCommissionType ?? "");
    setValue(pack.globalValue === null ? "" : String(Number(pack.globalValue)));
  }, [pack.id, pack.globalCommissionType, pack.globalValue]);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
      <span className="font-bold">Fallback commission</span>
      <span className="text-ink-400">(operators with no slab)</span>
      <select value={type} onChange={(e) => setType(e.target.value)} className={compactInputClasses} aria-label="Fallback type">
        <option value="">None</option>
        <option value="PERCENT">%</option>
        <option value="FLAT">₹ flat</option>
      </select>
      {type && <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className={`${compactInputClasses} w-20`} aria-label="Fallback value" />}
      <Button size="sm" variant="secondary" onClick={() => onSave(type, value)}>
        Save
      </Button>
    </div>
  );
}
