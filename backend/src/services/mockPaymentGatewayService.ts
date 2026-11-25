import crypto from "crypto";

// Stands in for a real gateway (Razorpay/Cashfree/PayU) until one is integrated. The
// webhook signature scheme here mirrors how those gateways actually work — HMAC-SHA256
// over the raw payload with a shared secret — so the verification logic written against
// this mock carries over unchanged when a real gateway is swapped in; only the secret
// and the order-creation call change.
// Mock checkout ("/wallet/add-money/mock-pay") credits a wallet without any real payment,
// so it only exists when explicitly switched on for development.
export const MOCK_PAYMENTS_ENABLED = process.env.ENABLE_MOCK_PAYMENTS === "true";

// Never fall back to a well-known default: anyone who knows it could forge a "payment
// succeeded" webhook. With mock payments on and no secret, a random per-process secret
// keeps the self-signed mock flow working without being guessable.
const WEBHOOK_SECRET =
  process.env.PAYMENT_WEBHOOK_SECRET || (MOCK_PAYMENTS_ENABLED ? crypto.randomBytes(32).toString("hex") : null);

export function webhookConfigured() {
  return WEBHOOK_SECRET !== null;
}

export function signPayload(payload: string): string {
  if (!WEBHOOK_SECRET) throw new Error("PAYMENT_WEBHOOK_SECRET is not configured");
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");
}

export function verifySignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return false;
  const expected = signPayload(payload);
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

export function createMockOrder(amount: number) {
  const gatewayOrderId = `mock_order_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  return {
    gatewayOrderId,
    // A real integration returns a checkout URL/SDK params here instead.
    checkoutUrl: `https://mock-gateway.local/checkout/${gatewayOrderId}`,
  };
}
