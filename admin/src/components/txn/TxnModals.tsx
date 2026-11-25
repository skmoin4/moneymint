import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { inputClasses } from "../ui/FormField";
import { type AdminTxn, errorText, formatStamp, inr } from "./types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-ink-100 py-1.5 text-[12.5px] last:border-0">
      <span className="text-ink-500">{label}</span>
      <span className="text-right font-semibold text-ink-800">{value}</span>
    </div>
  );
}

// Per-row "Action": mark a pending txn Success (with the operator's ref) or Failed
// (refunds the user), or refund one that already succeeded.
export function TxnActionModal({ txn, onClose, onDone }: { txn: AdminTxn; onClose: () => void; onDone: () => void }) {
  const [opRef, setOpRef] = useState("");
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [checkNote, setCheckNote] = useState("");

  async function checkStatus() {
    setBusy("CHECK");
    setError("");
    setCheckNote("");
    try {
      const res = await api.post(`/admin/transactions/${txn.id}/check-status`);
      const status = res.data.transaction.status;
      if (status !== "PENDING") {
        onDone();
        onClose();
        return;
      }
      setCheckNote(res.data.reason ?? "Still pending at the vendor.");
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function run(outcome: "SUCCESS" | "FAILED" | "REFUND") {
    if (outcome !== "SUCCESS") {
      const what = outcome === "REFUND" ? "refund" : "fail and refund";
      if (!window.confirm(`Really ${what} ${inr(txn.amount)} for ${txn.identifier}?`)) return;
    }
    setBusy(outcome);
    setError("");
    try {
      await api.post(`/admin/transactions/${txn.id}/action`, {
        outcome,
        providerRefId: opRef.trim() || undefined,
        remark: remark.trim() || undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title={`Action — ${txn.identifier}`} onClose={onClose}>
      <div className="mb-4 rounded-sm border border-ink-200 px-3 py-1">
        <Row label="User" value={`${txn.user.name} (${txn.user.phone})`} />
        <Row label="Provider / API" value={`${txn.operator.name} / ${txn.apiProvider.name}`} />
        <Row label="Amount" value={inr(txn.amount)} />
        <Row label="Status" value={txn.status} />
        <Row label="Time" value={formatStamp(txn.createdAt)} />
        <Row label="Txn ID" value={txn.id} />
      </div>

      {txn.status === "PENDING" && (
        <label className="mb-3 block">
          <span className="mb-1 block text-[12.5px] font-bold">Op Txn ID (operator reference)</span>
          <input value={opRef} onChange={(e) => setOpRef(e.target.value)} className={inputClasses} placeholder="Optional — needed for Success" />
        </label>
      )}
      {(txn.status === "PENDING" || txn.status === "SUCCESS") && (
        <label className="mb-4 block">
          <span className="mb-1 block text-[12.5px] font-bold">Remark</span>
          <input value={remark} onChange={(e) => setRemark(e.target.value)} className={inputClasses} placeholder="Optional" />
        </label>
      )}

      {error && <div className="mb-3 rounded-sm bg-row-failed px-3 py-2 text-[12.5px] text-[#a94442]">{error}</div>}
      {checkNote && <div className="mb-3 rounded-sm bg-row-pending px-3 py-2 text-[12.5px] text-[#8a6d3b]">{checkNote}</div>}

      <div className="flex flex-wrap gap-2">
        {txn.status === "PENDING" && (
          <>
            <Button variant="info" loading={busy === "CHECK"} disabled={!!busy} onClick={checkStatus}>
              Check Status
            </Button>
            <Button loading={busy === "SUCCESS"} disabled={!!busy} onClick={() => run("SUCCESS")}>
              Mark Success
            </Button>
            <Button variant="danger" loading={busy === "FAILED"} disabled={!!busy} onClick={() => run("FAILED")}>
              Mark Failed (refund)
            </Button>
          </>
        )}
        {txn.status === "SUCCESS" && (
          <Button variant="info" loading={busy === "REFUND"} disabled={!!busy} onClick={() => run("REFUND")}>
            Refund
          </Button>
        )}
        {(txn.status === "FAILED" || txn.status === "REFUNDED") && (
          <p className="text-[12.5px] text-ink-500">This transaction is already settled — no further action is possible.</p>
        )}
      </div>
    </Modal>
  );
}

interface CallLog {
  id: string;
  kind: string;
  method: string | null;
  url: string | null;
  requestBody: string | null;
  httpStatus: number | null;
  responseBody: string | null;
  parsedStatus: string | null;
  durationMs: number | null;
  createdAt: string;
}

export function TxnResponseModal({ txn, onClose, showLogs }: { txn: AdminTxn; onClose: () => void; showLogs?: boolean }) {
  const [logs, setLogs] = useState<CallLog[] | null>(null);
  useEffect(() => {
    if (showLogs) api.get(`/admin/transactions/${txn.id}/logs`).then((res) => setLogs(res.data.logs)).catch(() => setLogs([]));
  }, [txn.id, showLogs]);
  return (
    <Modal title={`Response — ${txn.identifier}`} onClose={onClose} wide>
      <div className="mb-3 text-[12.5px] text-ink-500">
        Op Txn: <span className="font-mono text-ink-800">{txn.providerRefId ?? "—"}</span> · Vendor txn:{" "}
        <span className="font-mono text-ink-800">{txn.vendorRefId ?? "—"}</span> · API: <span className="text-ink-800">{txn.apiProvider.name}</span>
        {txn.statusMessage && <div className="mt-1">Message: <span className="text-ink-800">{txn.statusMessage}</span></div>}
      </div>
      <pre className="overflow-x-auto rounded-sm border border-ink-200 bg-ink-50 p-3 text-[12px] text-ink-800">
        {txn.apiResponse ? JSON.stringify(txn.apiResponse, null, 2) : "No response recorded yet — the provider hasn't answered."}
      </pre>
      {showLogs && (
        <div className="mt-4">
          <div className="mb-2 text-[13px] font-bold">API log</div>
          {logs === null ? (
            <div className="text-ink-400">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="text-ink-400">No vendor traffic recorded for this transaction.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {logs.map((l) => (
                <div key={l.id} className="rounded-sm border border-ink-200 p-2 text-[11.5px]">
                  <div className="mb-1 flex flex-wrap gap-x-3 font-semibold">
                    <span>{formatStamp(l.createdAt)}</span>
                    <span>{l.kind}</span>
                    <span>{l.parsedStatus}</span>
                    {l.httpStatus !== null && <span>HTTP {l.httpStatus}</span>}
                    {l.durationMs !== null && <span>{l.durationMs} ms</span>}
                  </div>
                  <div className="break-all font-mono text-ink-600">
                    {l.method} {l.url}
                  </div>
                  {l.requestBody && <pre className="mt-1 whitespace-pre-wrap break-all text-ink-600">{l.requestBody}</pre>}
                  <pre className="mt-1 whitespace-pre-wrap break-all text-ink-800">{l.responseBody}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
