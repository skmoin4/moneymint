import crypto from "crypto";

// Stands in for a real gateway (Razorpay/Cashfree/PayU) until one is integrated. The
// webhook signature scheme here mirrors how those gateways actually work — HMAC-SHA256
// over the raw payload with a shared secret — so the verification logic written against
// this mock carries over unchanged when a real gateway is swapped in; only the secret
// and the order-creation call change.
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || "mock-webhook-secret-change-in-prod";

export function signPayload(payload: string): string {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");
}

export function verifySignature(payload: string, signature: string): boolean {
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
