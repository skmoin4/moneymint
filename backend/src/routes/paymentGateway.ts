import { Router, type Request } from "express";
import crypto from "crypto";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { getGateway, MOCK_PAYMENTS_ENABLED, type PaymentGateway } from "../services/payments/gateway";
import { mockRecordPayment, mockSign } from "../services/payments/mock";
import {
  creditGatewayOrder,
  creditQrPayment,
  gatewayChargePercents,
  recordFailedAttempt,
  topupLimits,
} from "../services/payments/topup";

// Wallet top-up ("Add Money"): online checkout through the payment gateway, plus each
// user's own static UPI QR that auto-credits. Money is only ever credited after the
// gateway itself confirms it — a signed webhook, or a checkout signature verified with
// our secret plus a payment lookup — never because the app says it paid.
export const paymentGatewayRouter = Router();

function requireGateway(): PaymentGateway {
  const gw = getGateway();
  if (!gw) throw new HttpError(503, "Online payment is not configured on this server");
  return gw;
}

paymentGatewayRouter.get("/config", authenticate, async (_req, res) => {
  const gw = getGateway();
  res.json({
    enabled: Boolean(gw),
    ...(gw ? gw.publicConfig() : {}),
    limits: await topupLimits(),
    chargePercents: await gatewayChargePercents(),
  });
});

const createOrderSchema = z.object({ amount: z.number().positive() });

paymentGatewayRouter.post("/order", authenticate, async (req, res) => {
  const gw = requireGateway();
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const amount = Math.round(parsed.data.amount * 100) / 100;
  const { min, max } = await topupLimits();
  if (amount < min || amount > max) throw new HttpError(400, `Amount must be between ₹${min} and ₹${max}`);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId }, select: { name: true, phone: true, email: true } });
  const receipt = `mm_${crypto.randomBytes(8).toString("hex")}`;
  const { orderId } = await gw.createOrder({ amount, receipt, notes: { userId: req.user!.userId } });
  const order = await prisma.paymentOrder.create({
    data: { userId: req.user!.userId, amount, gatewayOrderId: orderId, provider: gw.name },
  });

  // Everything the app needs to open the gateway's checkout.
  res.status(201).json({
    order,
    checkout: {
      ...gw.publicConfig(),
      orderId,
      amount: Math.round(amount * 100),
      currency: "INR",
      name: "MoneyMint",
      description: "Wallet top-up",
      prefill: { name: user.name, contact: user.phone, email: user.email ?? undefined },
    },
  });
});

const verifySchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

// Called by the app right after checkout closes successfully, so the wallet updates
// without waiting for the webhook. The signature proves the ids came from the gateway;
// the payment lookup proves the money was actually captured.
paymentGatewayRouter.post("/verify", authenticate, async (req, res) => {
  const gw = requireGateway();
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const { orderId, paymentId, signature } = parsed.data;

  const order = await prisma.paymentOrder.findUnique({ where: { gatewayOrderId: orderId } });
  if (!order || order.userId !== req.user!.userId) throw new HttpError(404, "Order not found");
  if (!gw.verifyCheckoutSignature({ orderId, paymentId, signature })) throw new HttpError(400, "Payment signature is invalid");

  const payment = await gw.fetchPayment(paymentId);
  if (payment.orderId !== orderId) throw new HttpError(400, "Payment does not belong to this order");
  if (payment.status !== "captured") {
    // Authorized but not yet captured: the payment.captured webhook will credit it.
    res.json({ order, pending: true });
    return;
  }
  res.json({ order: await creditGatewayOrder(orderId, payment), pending: false });
});

// Gateway → us. No user JWT: the HMAC signature over the raw body is the authentication.
paymentGatewayRouter.post("/webhook", async (req, res) => {
  const gw = getGateway();
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!gw) throw new HttpError(503, "Online payment is not configured on this server");
  if (!raw || !gw.verifyWebhook(raw, req.headers)) throw new HttpError(401, "Invalid webhook signature");

  const event = gw.parseWebhook(req.body);
  switch (event.kind) {
    case "PAYMENT_CAPTURED":
      // Payments without an order (e.g. QR) arrive via their own event.
      if (event.orderId) {
        await creditGatewayOrder(event.orderId, { id: event.paymentId, amount: event.amount, method: event.method }).catch((err) => {
          if (!(err instanceof HttpError && err.status === 404)) throw err;
        });
      }
      break;
    case "PAYMENT_FAILED":
      if (event.orderId) await recordFailedAttempt(event.orderId, event.paymentId, event.reason);
      break;
    case "QR_CREDITED":
      await creditQrPayment({ qrId: event.qrId, paymentId: event.paymentId, amount: event.amount, method: event.method, provider: gw.name }).catch((err) => {
        if (!(err instanceof HttpError && err.status === 404)) throw err;
      });
      break;
  }
  // Always 200 for authentic events, or the gateway keeps retrying.
  res.json({ ok: true });
});

paymentGatewayRouter.get("/history", authenticate, async (req, res) => {
  const orders = await prisma.paymentOrder.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ orders });
});

// The user's own static UPI QR (created on first request). Payments to it credit this
// user's wallet automatically.
paymentGatewayRouter.get("/qr", authenticate, async (req, res) => {
  const gw = requireGateway();
  let qr = await prisma.userPaymentQr.findUnique({ where: { userId: req.user!.userId } });
  if (!qr) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId }, select: { name: true } });
    const created = await gw.createUpiQr({ userId: req.user!.userId, name: user.name });
    qr = await prisma.userPaymentQr
      .create({ data: { userId: req.user!.userId, provider: gw.name, ...created } })
      .catch(async () => prisma.userPaymentQr.findUniqueOrThrow({ where: { userId: req.user!.userId } })); // concurrent first request
  }
  const upiLink = qr.upiId ? `upi://pay?${new URLSearchParams({ pa: qr.upiId, pn: "MoneyMint", cu: "INR" })}` : null;
  res.json({
    qr: {
      upiId: qr.upiId,
      imageUrl: qr.imageUrl,
      qrDataUrl: upiLink ? await QRCode.toDataURL(upiLink, { width: 280, margin: 1 }) : null,
      provider: qr.provider,
    },
  });
});

// ---- Development only (ENABLE_MOCK_PAYMENTS=true) ----------------------------------
// Stand in for the gateway's checkout and for someone paying a QR. They go through the
// same signature checks and settlement code as real payments.

paymentGatewayRouter.post("/mock-pay", authenticate, async (req, res) => {
  const gw = getGateway();
  if (!MOCK_PAYMENTS_ENABLED || gw?.name !== "MOCK") throw new HttpError(404, "Not found");
  const { gatewayOrderId, method } = req.body as { gatewayOrderId?: string; method?: string };
  if (typeof gatewayOrderId !== "string") throw new HttpError(400, "gatewayOrderId is required");

  const order = await prisma.paymentOrder.findUnique({ where: { gatewayOrderId } });
  if (!order || order.userId !== req.user!.userId) throw new HttpError(404, "Order not found");

  // What a real checkout returns to the app: payment id + signature, then the app verifies.
  const paymentId = mockRecordPayment(gatewayOrderId, Number(order.amount), method || "upi");
  const signature = mockSign(`${gatewayOrderId}|${paymentId}`);
  if (!gw.verifyCheckoutSignature({ orderId: gatewayOrderId, paymentId, signature })) throw new HttpError(500, "Signature self-check failed");
  const payment = await gw.fetchPayment(paymentId);
  res.json({ order: await creditGatewayOrder(gatewayOrderId, payment), paymentId, signature });
});

paymentGatewayRouter.post("/mock-qr-pay", authenticate, async (req, res) => {
  const gw = getGateway();
  if (!MOCK_PAYMENTS_ENABLED || gw?.name !== "MOCK") throw new HttpError(404, "Not found");
  const amount = Number((req.body as { amount?: number }).amount);
  if (!(amount > 0)) throw new HttpError(400, "amount is required");
  const qr = await prisma.userPaymentQr.findUnique({ where: { userId: req.user!.userId } });
  if (!qr) throw new HttpError(404, "Open your QR first");
  const paymentId = mockRecordPayment(null, amount, "upi");
  const result = await creditQrPayment({ qrId: qr.externalId, paymentId, amount, method: "upi", provider: "MOCK" });
  res.json({ paymentId, ...result });
});
