import { useState } from "react";
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

      <div className="flex flex-wrap gap-2">
        {txn.status === "PENDING" && (
          <>
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

export function TxnResponseModal({ txn, onClose }: { txn: AdminTxn; onClose: () => void }) {
  return (
    <Modal title={`Response — ${txn.identifier}`} onClose={onClose} wide>
      <div className="mb-3 text-[12.5px] text-ink-500">
        Op Txn: <span className="font-mono text-ink-800">{txn.providerRefId ?? "—"}</span> · API:{" "}
        <span className="text-ink-800">{txn.apiProvider.name}</span>
      </div>
      <pre className="overflow-x-auto rounded-sm border border-ink-200 bg-ink-50 p-3 text-[12px] text-ink-800">
        {txn.apiResponse ? JSON.stringify(txn.apiResponse, null, 2) : "No response recorded yet — the provider hasn't answered."}
      </pre>
    </Modal>
  );
}
