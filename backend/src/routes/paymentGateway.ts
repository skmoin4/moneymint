import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { createMockOrder, signPayload, verifySignature, webhookConfigured, MOCK_PAYMENTS_ENABLED } from "../services/mockPaymentGatewayService";

export const paymentGatewayRouter = Router();

const createOrderSchema = z.object({ amount: z.number().positive().max(100000) });

// "Add Money" — the app calls this to start a top-up; the returned checkoutUrl is what
// a real gateway SDK would open. The wallet is NOT credited here — only the webhook
// below, once the gateway confirms payment actually happened, ever moves money.
paymentGatewayRouter.post("/order", authenticate, async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }

  const { gatewayOrderId, checkoutUrl } = createMockOrder(parsed.data.amount);
  const order = await prisma.paymentOrder.create({
    data: {
      userId: req.user!.userId,
      amount: parsed.data.amount,
      gatewayOrderId,
    },
  });

  res.status(201).json({ order, checkoutUrl });
});

async function processGatewayCallback(
  gatewayOrderId: string,
  gatewayPaymentId: string,
  status: "SUCCESS" | "FAILED"
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.paymentOrder.findUnique({ where: { gatewayOrderId } });
    if (!order) {
      throw new HttpError(404, "Order not found");
    }
    if (order.status !== "PENDING") {
      // Already settled — the gateway retried the webhook. Idempotent no-op, not an error.
      return order;
    }

    if (status === "FAILED") {
      return tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: "FAILED", gatewayPaymentId },
      });
    }

    const updated = await tx.paymentOrder.update({
      where: { id: order.id },
      data: { status: "PAID", gatewayPaymentId },
    });

    const wallet = await tx.wallet.update({
      where: { userId: order.userId },
      data: { balance: { increment: order.amount } },
    });
    await tx.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        type: "CREDIT",
        amount: order.amount,
        balanceAfter: wallet.balance,
        referenceType: "WALLET_TOPUP",
        referenceId: order.id,
        description: `Wallet top-up via ${order.provider} (${gatewayPaymentId})`,
      },
    });

    return updated;
  });
}

const webhookSchema = z.object({
  gatewayOrderId: z.string(),
  gatewayPaymentId: z.string(),
  status: z.enum(["SUCCESS", "FAILED"]),
});

// Called by the payment gateway's own servers, not the app — there's no user JWT to
// check here, so the signature IS the authentication. Real gateways sign the raw
// request body the same way (HMAC over the payload with a shared webhook secret); the
// header name differs per vendor (Razorpay: X-Razorpay-Signature, Cashfree: a
// different one) but the verify-then-trust shape is identical, so this doesn't change
// when a real gateway replaces the mock — only the header name and secret do.
paymentGatewayRouter.post("/webhook", async (req, res) => {
  if (!webhookConfigured()) {
    throw new HttpError(503, "Payment webhook is not configured on this server");
  }
  const signature = req.header("X-Signature");
  const rawBody = JSON.stringify(req.body);
  if (!signature || !verifySignature(rawBody, signature)) {
    throw new HttpError(401, "Invalid webhook signature");
  }

  const parsed = webhookSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }

  await processGatewayCallback(parsed.data.gatewayOrderId, parsed.data.gatewayPaymentId, parsed.data.status);
  res.json({ ok: true });
});

// Stands in for the Flutter app's real gateway checkout SDK, which — with a real
// gateway — talks directly to the gateway's own servers and never touches our backend
// until the webhook fires. This endpoint is purely a mock-testing convenience; delete
// it once a real gateway is wired in. It still goes through the same signature-verified
// webhook path everything else does, so it's proving that path works, not bypassing it.
paymentGatewayRouter.post("/mock-pay", authenticate, async (req, res) => {
  if (!MOCK_PAYMENTS_ENABLED) {
    throw new HttpError(404, "Not found");
  }
  const { gatewayOrderId } = req.body as { gatewayOrderId?: string };
  if (typeof gatewayOrderId !== "string") {
    throw new HttpError(400, "gatewayOrderId is required");
  }

  const order = await prisma.paymentOrder.findUnique({ where: { gatewayOrderId } });
  if (!order || order.userId !== req.user!.userId) {
    throw new HttpError(404, "Order not found");
  }

  const gatewayPaymentId = `mock_pay_${Date.now()}`;
  const payload = { gatewayOrderId, gatewayPaymentId, status: "SUCCESS" as const };
  const rawBody = JSON.stringify(payload);
  const signature = signPayload(rawBody);
  if (!verifySignature(rawBody, signature)) {
    throw new HttpError(500, "Signature self-check failed");
  }

  const updated = await processGatewayCallback(payload.gatewayOrderId, payload.gatewayPaymentId, payload.status);
  res.json({ order: updated });
});

paymentGatewayRouter.get("/history", authenticate, async (req, res) => {
  const orders = await prisma.paymentOrder.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ orders });
});
