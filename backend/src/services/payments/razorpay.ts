import crypto from "crypto";
import type { PaymentGateway, WebhookEvent } from "./gateway";
import { HttpError } from "../../utils/httpError";

// Razorpay REST API (https://razorpay.com/docs/api/). Amounts travel in paise.
// RAZORPAY_API_BASE exists only so tests can point at a local stand-in.
export function razorpayGateway(): PaymentGateway {
  const keyId = process.env.RAZORPAY_KEY_ID!;
  const keySecret = process.env.RAZORPAY_KEY_SECRET!;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  const base = (process.env.RAZORPAY_API_BASE || "https://api.razorpay.com").replace(/\/$/, "");
  const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new HttpError(502, `Payment gateway unreachable: ${(err as Error).message}`);
    }
    const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
    if (!res.ok) {
      throw new HttpError(502, `Payment gateway error: ${json.error?.description ?? res.status}`);
    }
    return json;
  }

  const hmac = (secret: string, data: string | Buffer) => crypto.createHmac("sha256", secret).update(data).digest("hex");
  const safeEqual = (a: string, b: string) => {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
  };

  type RzpPayment = { id: string; order_id: string | null; amount: number; status: string; method: string | null; error_description?: string | null };

  return {
    name: "RAZORPAY",
    publicConfig: () => ({ gateway: "RAZORPAY", keyId }),

    async createOrder({ amount, receipt, notes }) {
      const order = await call<{ id: string }>("POST", "/v1/orders", {
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt,
        notes,
      });
      return { orderId: order.id };
    },

    verifyCheckoutSignature({ orderId, paymentId, signature }) {
      return safeEqual(hmac(keySecret, `${orderId}|${paymentId}`), signature);
    },

    async fetchPayment(paymentId) {
      const p = await call<RzpPayment>("GET", `/v1/payments/${encodeURIComponent(paymentId)}`);
      return { id: p.id, orderId: p.order_id, amount: p.amount / 100, status: p.status, method: p.method };
    },

    verifyWebhook(rawBody, headers) {
      const sig = headers["x-razorpay-signature"];
      if (!webhookSecret || typeof sig !== "string") return false;
      return safeEqual(hmac(webhookSecret, rawBody), sig);
    },

    parseWebhook(body): WebhookEvent {
      const b = body as { event?: string; payload?: { payment?: { entity?: RzpPayment }; qr_code?: { entity?: { id: string } } } };
      const payment = b.payload?.payment?.entity;
      switch (b.event) {
        case "payment.captured":
          if (!payment) break;
          return { kind: "PAYMENT_CAPTURED", orderId: payment.order_id, paymentId: payment.id, amount: payment.amount / 100, method: payment.method };
        case "payment.failed":
          if (!payment) break;
          return { kind: "PAYMENT_FAILED", orderId: payment.order_id, paymentId: payment.id, reason: payment.error_description ?? "Payment failed" };
        case "qr_code.credited": {
          const qrId = b.payload?.qr_code?.entity?.id;
          if (!payment || !qrId) break;
          return { kind: "QR_CREDITED", qrId, paymentId: payment.id, amount: payment.amount / 100, method: payment.method };
        }
      }
      return { kind: "IGNORED", event: b.event ?? "unknown" };
    },

    async createUpiQr({ userId, name }) {
      const qr = await call<{ id: string; image_url?: string }>("POST", "/v1/payments/qr_codes", {
        type: "upi_qr",
        name: name.slice(0, 40),
        usage: "multiple_use",
        fixed_amount: false,
        description: "Wallet top-up",
        notes: { userId },
      });
      return { externalId: qr.id, upiId: null, imageUrl: qr.image_url ?? null };
    },
  };
}
