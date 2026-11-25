/**
 * The payment gateway used for wallet top-ups (checkout) and per-user static UPI QRs.
 * Razorpay when RAZORPAY_KEY_ID/SECRET are set; the built-in mock when
 * ENABLE_MOCK_PAYMENTS=true (development); otherwise online top-up is disabled.
 * Cashfree/PayU can be added as another implementation of this interface.
 */
export interface GatewayPayment {
  id: string;
  orderId: string | null;
  amount: number; // rupees
  status: string; // gateway's status, e.g. "captured"
  method: string | null;
}

export type WebhookEvent =
  | { kind: "PAYMENT_CAPTURED"; orderId: string | null; paymentId: string; amount: number; method: string | null }
  | { kind: "PAYMENT_FAILED"; orderId: string | null; paymentId: string; reason: string }
  | { kind: "QR_CREDITED"; qrId: string; paymentId: string; amount: number; method: string | null }
  | { kind: "IGNORED"; event: string };

export interface PaymentGateway {
  name: "RAZORPAY" | "MOCK";
  /** Public checkout parameters the app/web needs (never secrets). */
  publicConfig(): Record<string, unknown>;
  createOrder(p: { amount: number; receipt: string; notes: Record<string, string> }): Promise<{ orderId: string }>;
  /** Checks the signature the checkout hands back to the app after payment. */
  verifyCheckoutSignature(p: { orderId: string; paymentId: string; signature: string }): boolean;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(body: unknown): WebhookEvent;
  createUpiQr(p: { userId: string; name: string }): Promise<{ externalId: string; upiId: string | null; imageUrl: string | null }>;
}

import { razorpayGateway } from "./razorpay";
import { mockGateway, MOCK_PAYMENTS_ENABLED } from "./mock";

let cached: PaymentGateway | null | undefined;

export function getGateway(): PaymentGateway | null {
  if (cached !== undefined) return cached;
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) cached = razorpayGateway();
  else if (MOCK_PAYMENTS_ENABLED) cached = mockGateway();
  else cached = null;
  return cached;
}

export { MOCK_PAYMENTS_ENABLED };
