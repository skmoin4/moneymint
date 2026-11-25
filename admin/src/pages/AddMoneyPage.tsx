import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { compactInputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { errorText, formatStamp, inr } from "../components/txn/types";

interface Config {
  enabled: boolean;
  gateway?: "RAZORPAY" | "MOCK";
  keyId?: string;
  limits: { min: number; max: number };
  chargePercents: Record<string, number>;
}

interface Order {
  id: string;
  amount: string;
  gatewayOrderId: string;
  gatewayPaymentId: string | null;
  status: string;
  channel: string;
  method: string | null;
  charges: string;
  netAmount: string | null;
  failureReason: string | null;
  createdAt: string;
}

interface Qr {
  upiId: string | null;
  imageUrl: string | null;
  qrDataUrl: string | null;
  provider: string;
}

interface RazorpayCheckout {
  open: () => void;
  on: (event: string, cb: (resp: { error?: { description?: string } }) => void) => void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const METHOD_LABEL: Record<string, string> = { upi: "UPI", card: "Card", netbanking: "Net banking", wallet: "Wallet", default: "Others" };

export function AddMoneyPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [qr, setQr] = useState<Qr | null>(null);
  const [qrError, setQrError] = useState("");
  const [mockMethod, setMockMethod] = useState("upi");
  const [mockQrAmount, setMockQrAmount] = useState("");

  const loadHistory = useCallback(() => {
    api.get("/wallet/add-money/history").then((res) => setOrders(res.data.orders));
  }, []);

  useEffect(() => {
    api.get("/wallet/add-money/config").then((res) => {
      setConfig(res.data);
      if (res.data.enabled) {
        api
          .get("/wallet/add-money/qr")
          .then((r) => setQr(r.data.qr))
          .catch((err) => setQrError(errorText(err)));
      }
    });
    loadHistory();
  }, [loadHistory]);

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (!config?.enabled) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.post("/wallet/add-money/order", { amount: Number(amount) });
      const { checkout } = res.data;

      if (config.gateway === "MOCK") {
        const paid = await api.post("/wallet/add-money/mock-pay", { gatewayOrderId: checkout.orderId, method: mockMethod });
        setMessage({ ok: true, text: `Test payment done: ${inr(paid.data.order.netAmount ?? paid.data.order.amount)} added.` });
        setAmount("");
        loadHistory();
        return;
      }

      if (!(await loadRazorpay()) || !window.Razorpay) throw new Error("Could not load the payment page. Check your connection.");
      const rzp = new window.Razorpay({
        key: checkout.keyId,
        order_id: checkout.orderId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: checkout.name,
        description: checkout.description,
        prefill: checkout.prefill,
        theme: { color: "#1ab394" },
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const v = await api.post("/wallet/add-money/verify", {
              orderId: resp.razorpay_order_id,
              paymentId: resp.razorpay_payment_id,
              signature: resp.razorpay_signature,
            });
            setMessage(
              v.data.pending
                ? { ok: true, text: "Payment received — your wallet will be credited in a moment." }
                : { ok: true, text: `${inr(v.data.order.netAmount ?? v.data.order.amount)} added to your wallet.` }
            );
            setAmount("");
          } catch (err) {
            setMessage({ ok: false, text: `${errorText(err)}. If money was debited, it will be credited automatically once the bank confirms.` });
          } finally {
            loadHistory();
          }
        },
        modal: { ondismiss: () => loadHistory() },
      });
      rzp.on("payment.failed", (resp) => setMessage({ ok: false, text: resp.error?.description ?? "Payment failed" }));
      rzp.open();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error && !("response" in err) ? err.message : errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function simulateQr(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/wallet/add-money/mock-qr-pay", { amount: Number(mockQrAmount) });
      setMessage({ ok: true, text: `Test UPI payment of ₹${mockQrAmount} received on your QR.` });
      setMockQrAmount("");
      loadHistory();
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    }
  }

  const charges = config ? Object.entries(config.chargePercents).filter(([, v]) => v > 0) : [];

  return (
    <div>
      <PageHeader title="Add Money" />

      {message && (
        <div className={`mb-4 rounded-sm px-3 py-2 text-[12.5px] ${message.ok ? "bg-row-success text-[#3c763d]" : "bg-row-failed text-[#a94442]"}`}>{message.text}</div>
      )}

      {config && !config.enabled ? (
        <div className="mb-5 rounded-sm border border-ink-200 bg-white p-4 text-ink-600">
          Online top-up isn't available yet. Use <b>Balance Requests</b> to deposit by bank transfer.
        </div>
      ) : (
        config && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Pay online (UPI / Card / Net banking)">
              <form onSubmit={pay} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[12.5px] font-bold">Amount (₹)</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    required
                    placeholder={`₹${config.limits.min} – ₹${config.limits.max}`}
                    className={`${compactInputClasses} w-56`}
                  />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[500, 1000, 2000, 5000].map((v) => (
                    <button key={v} type="button" onClick={() => setAmount(String(v))} className="rounded-[3px] border border-ink-300 px-2.5 py-1 text-[12px] hover:bg-ink-50">
                      ₹{v}
                    </button>
                  ))}
                </div>
                {config.gateway === "MOCK" && (
                  <label className="flex items-center gap-2 text-[12.5px]">
                    <span className="font-bold">Test method:</span>
                    <select value={mockMethod} onChange={(e) => setMockMethod(e.target.value)} className={compactInputClasses}>
                      <option value="upi">UPI</option>
                      <option value="card">Card</option>
                      <option value="netbanking">Net banking</option>
                    </select>
                  </label>
                )}
                <div className="text-[12px] text-ink-500">
                  {charges.length === 0
                    ? "No charges."
                    : `Charges: ${charges.map(([k, v]) => `${METHOD_LABEL[k] ?? k} ${v}%`).join(", ")}${config.chargePercents.upi === 0 ? " · UPI free" : ""}`}
                </div>
                <Button type="submit" loading={busy} className="self-start">
                  {config.gateway === "MOCK" ? "Pay (test mode)" : "Proceed to pay"}
                </Button>
              </form>
            </Panel>

            <Panel title="Your UPI QR — auto credit">
              {qrError ? (
                <div className="text-ink-500">{qrError}</div>
              ) : !qr ? (
                <div className="text-ink-400">Loading…</div>
              ) : (
                <div className="flex flex-wrap items-start gap-4">
                  {(qr.imageUrl || qr.qrDataUrl) && <img src={qr.imageUrl ?? qr.qrDataUrl!} alt="Your UPI QR code" width={180} height={180} className="rounded-sm border border-ink-200" />}
                  <div className="min-w-0 flex-1 text-[12.5px]">
                    {qr.upiId && (
                      <div className="mb-2">
                        UPI ID: <b className="font-mono">{qr.upiId}</b>
                      </div>
                    )}
                    <p className="text-ink-600">
                      Scan with any UPI app and pay any amount. It is added to your wallet automatically within a minute — no request needed. Keep this QR at your shop for customers who pay you.
                    </p>
                    {config.gateway === "MOCK" && (
                      <form onSubmit={simulateQr} className="mt-3 flex items-center gap-1.5">
                        <input value={mockQrAmount} onChange={(e) => setMockQrAmount(e.target.value)} inputMode="decimal" required placeholder="₹" className={`${compactInputClasses} w-24`} aria-label="Test amount" />
                        <Button size="sm" type="submit">
                          Simulate UPI payment
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </Panel>
          </div>
        )
      )}

      <h2 className="mb-2 text-[17px] text-ink-800">Top-up history</h2>
      <Table>
        <THead>
          <Th>Date</Th>
          <Th>Via</Th>
          <Th>Method</Th>
          <Th className="text-right">Amount</Th>
          <Th className="text-right">Charges</Th>
          <Th className="text-right">Credited</Th>
          <Th>Status</Th>
          <Th>Reference</Th>
        </THead>
        <tbody>
          {orders.length === 0 ? (
            <Tr>
              <Td colSpan={8} className="py-6 text-center text-ink-400">
                No top-ups yet.
              </Td>
            </Tr>
          ) : (
            orders.map((o) => (
              <Tr key={o.id}>
                <Td className="whitespace-nowrap">{formatStamp(o.createdAt)}</Td>
                <Td>{o.channel === "QR" ? "UPI QR" : "Online"}</Td>
                <Td className="uppercase">{o.method ?? "—"}</Td>
                <Td className="text-right">{inr(o.amount)}</Td>
                <Td className="text-right">{Number(o.charges) > 0 ? inr(o.charges) : "—"}</Td>
                <Td className="text-right">{o.netAmount ? inr(o.netAmount) : "—"}</Td>
                <Td>
                  <Badge>{o.status}</Badge>
                  {o.failureReason && <div className="mt-0.5 max-w-56 text-[11px] text-ink-500">{o.failureReason}</div>}
                </Td>
                <Td className="font-mono text-[11px]">{o.gatewayPaymentId ?? o.gatewayOrderId}</Td>
              </Tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}
