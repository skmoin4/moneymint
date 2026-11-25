import { prisma } from "../../config/prisma";
import { HttpError } from "../../utils/httpError";
import { sendSms } from "../smsService";
import type { GatewayPayment } from "./gateway";

const round2 = (n: number) => Math.round(n * 100) / 100;

async function setting(key: string) {
  return (await prisma.systemSetting.findUnique({ where: { key } }))?.value ?? null;
}

export async function topupLimits() {
  const min = Number(await setting("topupMin")) || 10;
  const max = Number(await setting("topupMax")) || 100000;
  return { min, max };
}

/**
 * Gateway fee passed on to the user, by payment method — setting "gatewayCharges", JSON
 * like {"upi":0,"card":1.8,"netbanking":1.5,"default":1.8} (percent). Unset = no fee.
 */
export async function gatewayChargePercents(): Promise<Record<string, number>> {
  try {
    const raw = JSON.parse((await setting("gatewayCharges")) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), Math.max(0, Math.min(10, Number(v) || 0))]));
  } catch {
    return {};
  }
}

async function chargeFor(channel: "GATEWAY" | "QR", method: string | null, amount: number) {
  if (channel === "QR") {
    const pct = Math.max(0, Math.min(10, Number(await setting("qrChargePercent")) || 0));
    return round2((amount * pct) / 100);
  }
  const table = await gatewayChargePercents();
  const pct = table[(method ?? "").toLowerCase()] ?? table.default ?? 0;
  return round2((amount * pct) / 100);
}

async function notify(userId: string, amount: number, charges: number, via: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (!user) return;
  const net = round2(amount - charges);
  await sendSms(
    user.phone,
    `Rs.${net} added to your MoneyMint wallet via ${via}${charges > 0 ? ` (Rs.${amount} less Rs.${charges} charges)` : ""}.`,
    "WALLET_TOPUP"
  ).catch(() => null);
}

/**
 * Credits a checkout order once the gateway confirms the payment (webhook or verified
 * checkout callback, whichever arrives first). Idempotent: the PENDING→PAID claim is
 * atomic, so a retried webhook or a webhook racing the callback credits only once.
 * A gateway amount that differs from the order is never credited.
 */
export async function creditGatewayOrder(gatewayOrderId: string, payment: Pick<GatewayPayment, "id" | "amount" | "method">) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.paymentOrder.findUnique({ where: { gatewayOrderId } });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.status !== "PENDING") return { order, credited: false };

    if (Math.abs(Number(order.amount) - payment.amount) > 0.001) {
      const failed = await tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: "FAILED", gatewayPaymentId: payment.id, failureReason: `Amount mismatch: paid ₹${payment.amount}, order ₹${order.amount} — reconcile manually` },
      });
      return { order: failed, credited: false };
    }

    const amount = Number(order.amount);
    const charges = await chargeFor("GATEWAY", payment.method, amount);
    const claimed = await tx.paymentOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: {
        status: "PAID",
        gatewayPaymentId: payment.id,
        method: payment.method,
        charges,
        netAmount: round2(amount - charges),
        paidAt: new Date(),
        failureReason: null,
      },
    });
    if (claimed.count === 0) return { order, credited: false };

    const wallet = await tx.wallet.update({ where: { userId: order.userId }, data: { balance: { increment: amount } } });
    await tx.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        type: "CREDIT",
        amount,
        balanceAfter: wallet.balance,
        referenceType: "WALLET_TOPUP",
        referenceId: order.id,
        description: `Wallet top-up via ${order.provider}${payment.method ? ` (${payment.method})` : ""} — ${payment.id}`,
      },
    });
    if (charges > 0) {
      const after = await tx.wallet.update({ where: { userId: order.userId }, data: { balance: { decrement: charges } } });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: "DEBIT",
          amount: charges,
          balanceAfter: after.balance,
          referenceType: "GATEWAY_CHARGE",
          referenceId: order.id,
          description: `Gateway charge on ₹${amount} top-up (${payment.method ?? "online"})`,
        },
      });
    }
    return { order: await tx.paymentOrder.findUniqueOrThrow({ where: { id: order.id } }), credited: true, charges, userId: order.userId, amount };
  });

  if (result.credited) await notify(result.userId!, result.amount!, result.charges!, "online payment");
  return result.order;
}

/** A failed attempt doesn't fail the order — the user may retry on the same checkout. */
export async function recordFailedAttempt(gatewayOrderId: string, paymentId: string, reason: string) {
  await prisma.paymentOrder.updateMany({
    where: { gatewayOrderId, status: "PENDING" },
    data: { failureReason: `${reason} (${paymentId})` },
  });
}

/**
 * Money paid to a user's static UPI QR. Each gateway payment id is stored as its own
 * PaymentOrder (unique gatewayOrderId), so a retried webhook is a no-op.
 */
export async function creditQrPayment(p: { qrId: string; paymentId: string; amount: number; method: string | null; provider: string }) {
  const qr = await prisma.userPaymentQr.findUnique({ where: { externalId: p.qrId } });
  if (!qr) throw new HttpError(404, "Unknown QR code");
  const amount = round2(p.amount);
  if (amount <= 0) throw new HttpError(400, "Invalid amount");
  const charges = await chargeFor("QR", p.method, amount);

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.paymentOrder.create({
        data: {
          userId: qr.userId,
          amount,
          gatewayOrderId: p.paymentId,
          gatewayPaymentId: p.paymentId,
          provider: p.provider,
          status: "PAID",
          channel: "QR",
          method: p.method,
          charges,
          netAmount: round2(amount - charges),
          paidAt: new Date(),
        },
      });
      const wallet = await tx.wallet.update({ where: { userId: qr.userId }, data: { balance: { increment: amount } } });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: "CREDIT",
          amount,
          balanceAfter: wallet.balance,
          referenceType: "WALLET_TOPUP",
          referenceId: order.id,
          description: `UPI QR payment received — ${p.paymentId}`,
        },
      });
      if (charges > 0) {
        const after = await tx.wallet.update({ where: { userId: qr.userId }, data: { balance: { decrement: charges } } });
        await tx.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            type: "DEBIT",
            amount: charges,
            balanceAfter: after.balance,
            referenceType: "GATEWAY_CHARGE",
            referenceId: order.id,
            description: `QR collection charge on ₹${amount}`,
          },
        });
      }
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return { duplicate: true };
    throw err;
  }
  await notify(qr.userId, amount, charges, "UPI QR");
  return { duplicate: false };
}
