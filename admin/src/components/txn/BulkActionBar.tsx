import { useState } from "react";
import { api } from "../../api/client";
import { compactInputClasses } from "../ui/FormField";
import { errorText, type ProviderOption } from "./types";

// "Apply action: [..] Go | Send to API: [..] □ Process in background Send" — works on the
// rows ticked in the table below it.
export function BulkActionBar({
  selectedIds,
  providers,
  canSendToApi,
  onDone,
}: {
  selectedIds: string[];
  providers: ProviderOption[];
  canSendToApi: boolean;
  onDone: (message: string) => void;
}) {
  const [action, setAction] = useState("");
  const [providerId, setProviderId] = useState("");
  const [background, setBackground] = useState(false);
  const [busy, setBusy] = useState(false);

  const none = selectedIds.length === 0;

  async function applyAction() {
    if (!action || none) return;
    const label = action === "REFUND" ? "refund" : action === "FAILED" ? "mark FAILED (and refund)" : "mark SUCCESS";
    if (!window.confirm(`${label} ${selectedIds.length} transaction(s)?`)) return;
    setBusy(true);
    try {
      const res = await api.post("/admin/transactions/bulk-action", { ids: selectedIds, outcome: action });
      const f = res.data.failures as { error: string }[];
      onDone(`${res.data.done} updated${f.length ? `, ${f.length} skipped (${f[0].error})` : ""}.`);
    } catch (err) {
      onDone(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendToApi() {
    if (!providerId || none) return;
    setBusy(true);
    try {
      const res = await api.post("/admin/transactions/send-to-api", { ids: selectedIds, apiProviderId: providerId, background });
      if (background) {
        onDone(`${res.data.queued} transaction(s) sent in background — this list refreshes as they settle.`);
      } else {
        const f = res.data.failures as { error: string }[];
        onDone(`${res.data.done} sent${f.length ? `, ${f.length} failed (${f[0].error})` : ""}.`);
      }
    } catch (err) {
      onDone(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const goBtn = "rounded-[3px] bg-brand-500 px-2.5 py-[5px] text-[12px] text-white hover:bg-brand-600 disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
      <div className="flex items-center gap-1.5">
        <span className="font-bold">Apply action:</span>
        <select value={action} onChange={(e) => setAction(e.target.value)} className={`${compactInputClasses} py-[3px]`}>
          <option value="">Select Action</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="REFUND">Refund</option>
        </select>
        <button disabled={busy || none || !action} onClick={applyAction} className={goBtn}>
          Go
        </button>
      </div>
      {canSendToApi && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold">Send to API:</span>
          <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className={`${compactInputClasses} py-[3px]`}>
            <option value="">Select</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} />
            Process in background
          </label>
          <button disabled={busy || none || !providerId} onClick={sendToApi} className={goBtn}>
            Send
          </button>
        </div>
      )}
      <span className="text-ink-500">{none ? "Tick rows below to act on them." : `${selectedIds.length} selected`}</span>
    </div>
  );
}
