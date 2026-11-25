/**
 * A stand-in recharge vendor for testing the HTTP integration end to end, without a real
 * vendor account. Behaves like a typical Indian recharge API:
 *
 *   GET /api/recharge?member_id=&token=&number=&amount=&op=&txnid=
 *     → {"status":"SUCCESS"|"FAILURE"|"PENDING","txid":"<vendor id>","opid":"<operator ref>","message":"..."}
 *   GET /api/status?member_id=&token=&txnid=
 *     → same shape, current state
 *
 * Outcome by the amount's last digit: 1 → FAILURE, 3 → PENDING then a SUCCESS callback
 * after 3s, 5 → PENDING with no callback (only a status check finds it, after 10s),
 * 7 → PENDING then a FAILURE callback, anything else → SUCCESS.
 *
 * Run:  FAKE_VENDOR_CALLBACK="<callback URL from API Parsing Setting>" npx tsx scripts/fake-vendor.ts
 * Configure the provider in the panel as described in API.md ("Testing with the fake vendor").
 */
import express from "express";
import crypto from "crypto";

const PORT = Number(process.env.FAKE_VENDOR_PORT || 4100);
const MEMBER_ID = process.env.FAKE_VENDOR_MEMBER || "M1001";
const TOKEN = process.env.FAKE_VENDOR_TOKEN || "fake-token-123";
const CALLBACK = process.env.FAKE_VENDOR_CALLBACK || "";

type State = { status: "SUCCESS" | "FAILURE" | "PENDING"; txid: string; opid: string; createdAt: number; resolveTo?: "SUCCESS" | "FAILURE" };
const txns = new Map<string, State>();

const app = express();

function auth(q: Record<string, unknown>) {
  return q.member_id === MEMBER_ID && q.token === TOKEN;
}

app.get("/api/recharge", (req, res) => {
  const q = req.query as Record<string, string>;
  if (!auth(q)) return res.status(401).json({ status: "FAILURE", message: "Invalid credentials" });
  if (!q.txnid || !q.number || !q.amount) return res.json({ status: "FAILURE", message: "Missing parameters" });
  if (txns.has(q.txnid)) return res.json({ status: "FAILURE", message: "Duplicate txnid" });

  const digit = q.amount.replace(/\D/g, "").slice(-1);
  const txid = `FV${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const opid = `OP${Math.floor(Math.random() * 1e10)}`;
  let state: State;
  if (digit === "1") state = { status: "FAILURE", txid, opid: "", createdAt: Date.now() };
  else if (digit === "3" || digit === "5" || digit === "7") {
    state = { status: "PENDING", txid, opid: "", createdAt: Date.now(), resolveTo: digit === "7" ? "FAILURE" : "SUCCESS" };
  } else state = { status: "SUCCESS", txid, opid, createdAt: Date.now() };
  txns.set(q.txnid, state);

  if ((digit === "3" || digit === "7") && CALLBACK) {
    setTimeout(async () => {
      state.status = state.resolveTo!;
      state.opid = state.status === "SUCCESS" ? opid : "";
      const url = `${CALLBACK}&txnid=${encodeURIComponent(q.txnid)}&status=${state.status}&opref=${state.opid}&vendor_txid=${txid}`;
      const r = await fetch(url).catch((e) => ({ status: `ERR ${e}` }) as unknown as Response);
      console.log(`callback ${q.txnid} ${state.status} → ${r.status}`);
    }, 3000);
  }

  console.log(`recharge ${q.op} ${q.number} ₹${q.amount} txnid=${q.txnid} → ${state.status}`);
  res.json({ status: state.status, txid, opid: state.opid, message: state.status === "FAILURE" ? "Operator down" : "Request accepted" });
});

app.get("/api/status", (req, res) => {
  const q = req.query as Record<string, string>;
  if (!auth(q)) return res.status(401).json({ status: "FAILURE", message: "Invalid credentials" });
  const state = txns.get(q.txnid);
  if (!state) return res.json({ status: "NOT_FOUND", message: "Unknown txnid" });
  if (state.status === "PENDING" && Date.now() - state.createdAt > 10_000) {
    state.status = state.resolveTo ?? "SUCCESS";
    state.opid = state.status === "SUCCESS" ? `OP${Math.floor(Math.random() * 1e10)}` : "";
  }
  res.json({ status: state.status, txid: state.txid, opid: state.opid, message: "" });
});

app.listen(PORT, () => console.log(`Fake vendor on http://localhost:${PORT} (member ${MEMBER_ID}, token ${TOKEN})`));
