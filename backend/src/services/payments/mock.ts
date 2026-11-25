import crypto from "crypto";
import type { PaymentGateway, WebhookEvent } from "./gateway";

// Development stand-in with the same shape as Razorpay (HMAC-signed checkout and
// webhooks, "captured" payments, multi-use UPI QRs). Payments are made with the
// dev-only /wallet/add-money/mock-pay and /mock-qr-pay endpoints.
export const MOCK_PAYMENTS_ENABLED = process.env.ENABLE_MOCK_PAYMENTS === "true";

// Random per process: nothing outside this server can forge a mock payment.
const SECRET = crypto.randomBytes(32).toString("hex");
const payments = new Map<string, { orderId: string | null; amount: number; method: string }>();

export function mockSign(data: string | Buffer) {
  return crypto.createHmac("sha256", SECRET).update(data).digest("hex");
}

/** Records a simulated payment so fetchPayment can confirm it, like the real gateway would. */
export function mockRecordPayment(orderId: string | null, amount: number, method: string) {
  const id = `pay_mock_${crypto.randomBytes(6).toString("hex")}`;
  payments.set(id, { orderId, amount, method });
  return id;
}

export function mockGateway(): PaymentGateway {
  return {
    name: "MOCK",
    publicConfig: () => ({ gateway: "MOCK" }),
    async createOrder() {
      return { orderId: `order_mock_${Date.now()}_${crypto.randomBytes(4).toString("hex")}` };
    },
    verifyCheckoutSignature({ orderId, paymentId, signature }) {
      const expected = mockSign(`${orderId}|${paymentId}`);
      return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    },
    async fetchPayment(paymentId) {
      const p = payments.get(paymentId);
      return p
        ? { id: paymentId, orderId: p.orderId, amount: p.amount, status: "captured", method: p.method }
        : { id: paymentId, orderId: null, amount: 0, status: "failed", method: null };
    },
    verifyWebhook(rawBody, headers) {
      const sig = headers["x-signature"];
      if (typeof sig !== "string") return false;
      const expected = mockSign(rawBody);
      return expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    },
    parseWebhook(body): WebhookEvent {
      const b = body as { event?: string; orderId?: string; paymentId?: string; amount?: number; method?: string; qrId?: string; reason?: string };
      if (b.event === "payment.captured" && b.paymentId) {
        return { kind: "PAYMENT_CAPTURED", orderId: b.orderId ?? null, paymentId: b.paymentId, amount: Number(b.amount), method: b.method ?? null };
      }
      if (b.event === "payment.failed" && b.paymentId) {
        return { kind: "PAYMENT_FAILED", orderId: b.orderId ?? null, paymentId: b.paymentId, reason: b.reason ?? "Payment failed" };
      }
      if (b.event === "qr_code.credited" && b.paymentId && b.qrId) {
        return { kind: "QR_CREDITED", qrId: b.qrId, paymentId: b.paymentId, amount: Number(b.amount), method: b.method ?? "upi" };
      }
      return { kind: "IGNORED", event: b.event ?? "unknown" };
    },
    async createUpiQr({ userId }) {
      return { externalId: `qr_mock_${userId.slice(0, 8)}_${crypto.randomBytes(3).toString("hex")}`, upiId: `mm${userId.slice(0, 8)}@mockupi`, imageUrl: null };
    },
  };
}
