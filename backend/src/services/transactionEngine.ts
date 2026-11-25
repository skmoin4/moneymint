import { prisma } from "../config/prisma";
import { HttpError } from "../utils/httpError";
import { sendRecharge, checkStatus, ProviderDownError, type ProviderResult, type ProviderTarget } from "./providerClient";
import { sendSms } from "./smsService";
import { distributeCommission, userRate, vendorMargin } from "./commission";
import { enqueuePartnerCallback } from "./partnerCallbacks";
import type { Prisma } from "../generated/prisma/client";

interface RewardParams {
  transactionId: string;
  userId: string;
  operatorId: string;
  apiProviderId: string;
  amount: number;
  descriptionLabel: string;
  identifier: string;
  // Recharge/BBPS/DMT pay the vendor out of the pre-loaded provider float, so Wallet 1
  // depletes by the transaction amount. AEPS cash withdrawal instead dispenses the
  // customer's OWN bank funds via biometric auth — no platform float is spent — so callers
  // for that flow pass false to skip this step.
  depleteProviderWallet?: boolean;
}

/**
 * Runs everything that happens on a SUCCESSFUL transaction, regardless of which flow
 * settled it (shared recharge/BBPS/DMT engine, or AEPS's own settlement path): deplete
 * the vendor's operational float (net of vendor margin), pay commission up the chain, apply
 * the best matching promotional cashback offer, and pay the referrer's reward if this
 * user was referred. Returns the commission amount so the caller can persist it.
 */
export async function applySuccessRewards(
  tx: Prisma.TransactionClient,
  {
    transactionId,
    userId,
    operatorId,
    apiProviderId,
    amount,
    descriptionLabel,
    identifier,
    depleteProviderWallet = true,
  }: RewardParams
): Promise<number> {
  // Vendor margin: the vendor deducts amount − margin from our float, so Wallet 1 drops
  // by the net cost and the margin is recorded as platform income on the transaction.
  const margin = await vendorMargin(tx, operatorId, apiProviderId, amount);
  if (depleteProviderWallet) {
    const cost = Math.round((amount - margin) * 100) / 100;
    const providerWallet = await tx.apiProvider.update({
      where: { id: apiProviderId },
      data: { walletBalance: { decrement: cost } },
    });
    await tx.providerWalletEntry.create({
      data: {
        apiProviderId,
        walletSlot: 1,
        type: "DEBIT",
        amount: cost,
        balanceAfter: providerWallet.walletBalance,
        referenceId: transactionId,
        description: margin > 0 ? `${descriptionLabel} settled (${identifier}) — ₹${amount} less ₹${margin} margin` : `${descriptionLabel} settled (${identifier})`,
      },
    });
  }
  if (margin > 0) {
    await tx.transaction.update({ where: { id: transactionId }, data: { vendorCommission: margin } });
  }

  const commission = await distributeCommission(tx, {
    transactionId,
    userId,
    operatorId,
    amount,
    label: descriptionLabel,
    identifier,
  });

  const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true, referredById: true } });

  // Promotional cashback — a percentage on top of the normal commission, from any
  // currently-active offer matching this operator (or a platform-wide offer).
  const now = new Date();
  const cashbackOffers = await tx.cashbackOffer.findMany({
    where: {
      isActive: true,
      OR: [{ operatorId }, { operatorId: null }],
      minAmount: { lte: amount },
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validTo: null }, { validTo: { gte: now } }] },
      ],
    },
    orderBy: { percent: "desc" },
  });
  const bestOffer = cashbackOffers[0];
  if (bestOffer) {
    const rawCashback = amount * (Number(bestOffer.percent) / 100);
    const cashback = Math.round(Math.min(rawCashback, Number(bestOffer.maxCashback ?? rawCashback)) * 100) / 100;
    if (cashback > 0) {
      const wallet = await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: cashback } },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: "CREDIT",
          amount: cashback,
          balanceAfter: wallet.balance,
          referenceType: "CASHBACK",
          referenceId: transactionId,
          description: `${bestOffer.name} — cashback on ${descriptionLabel.toLowerCase()} (${identifier})`,
        },
      });
    }
  }

  // Referral reward — whoever referred this user earns a percentage of every
  // successful transaction the referred user makes, credited to the referrer's wallet.
  if (user?.referredById) {
    const referralSetting = await tx.systemSetting.findUnique({ where: { key: "referralRewardPercent" } });
    const referralPercent = Number(referralSetting?.value ?? 0);
    if (referralPercent > 0) {
      const reward = Math.round(amount * (referralPercent / 100) * 100) / 100;
      if (reward > 0) {
        const referrerWallet = await tx.wallet.findUnique({ where: { userId: user.referredById } });
        if (referrerWallet) {
          const updatedReferrerWallet = await tx.wallet.update({
            where: { userId: user.referredById },
            data: { balance: { increment: reward } },
          });
          await tx.ledgerEntry.create({
            data: {
              walletId: updatedReferrerWallet.id,
              type: "CREDIT",
              amount: reward,
              balanceAfter: updatedReferrerWallet.balance,
              referenceType: "REFERRAL_REWARD",
              referenceId: transactionId,
              description: `Referral reward: ${user.name} completed a ${descriptionLabel.toLowerCase()} of ₹${amount}`,
            },
          });
        }
      }
    }
  }

  return commission;
}

type EngineTransactionType = "RECHARGE" | "BBPS" | "DMT" | "AEPS";

interface ProcessTransactionInput {
  userId: string;
  operatorCode: string;
  identifier: string;
  amount: number;
  transactionType: EngineTransactionType;
  descriptionLabel: string; // e.g. "Recharge", "Bill payment"
  source?: TransactionSource;
  clientRef?: string; // API users' own request id (unique per user)
}

export type TransactionSource = "APP" | "WEB" | "API" | "MANUAL" | "QUEUE";

export async function processProviderTransaction({
  userId,
  operatorCode,
  identifier,
  amount,
  transactionType,
  descriptionLabel,
  source = "APP",
  clientRef,
}: ProcessTransactionInput) {
  const stopSetting = await prisma.systemSetting.findUnique({ where: { key: "stopAllApiUsers" } });
  if (stopSetting?.value === "true") {
    throw new HttpError(503, "All API transactions are temporarily stopped by the administrator");
  }

  const operator = await prisma.operator.findUnique({ where: { code: operatorCode } });
  if (!operator) {
    throw new HttpError(404, "Operator not found");
  }
  if (!operator.isActive) {
    throw new HttpError(503, "This operator is currently disabled");
  }

  const mappings = await prisma.operatorApiMapping.findMany({
    where: { operatorId: operator.id, isActive: true },
    orderBy: { priority: "asc" },
    include: { apiProvider: true },
  });
  if (mappings.length === 0) {
    throw new HttpError(503, "No active API provider configured for this operator");
  }

  // A negative own-rate means this user's pack charges a surcharge (typical for DMT/BBPS):
  // it is taken together with the amount and refunded with it if the transaction fails.
  const ownRate = await userRate(prisma, userId, operator.id, amount);
  const surcharge = ownRate !== null && ownRate < 0 ? -ownRate : 0;

  const transaction = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: amount } },
    });

    const txn = await tx.transaction.create({
      data: {
        userId,
        type: transactionType,
        operatorId: operator.id,
        apiProviderId: mappings[0].apiProviderId,
        identifier,
        amount,
        surcharge,
        deduction: amount + surcharge,
        status: "PENDING",
        source,
        clientRef,
      },
    });

    await tx.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        type: "DEBIT",
        amount,
        balanceAfter: wallet.balance,
        referenceType: transactionType,
        referenceId: txn.id,
        description: `${descriptionLabel} ${identifier} (${operator.name})`,
      },
    });

    let finalBalance = wallet.balance;
    if (surcharge > 0) {
      const charged = await tx.wallet.update({ where: { userId }, data: { balance: { decrement: surcharge } } });
      finalBalance = charged.balance;
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: "DEBIT",
          amount: surcharge,
          balanceAfter: charged.balance,
          referenceType: "SURCHARGE",
          referenceId: txn.id,
          description: `Surcharge on ${descriptionLabel.toLowerCase()} of ₹${amount} (${identifier})`,
        },
      });
    }
    if (finalBalance.lessThan(0)) {
      throw new HttpError(400, surcharge > 0 ? `Insufficient balance (₹${amount} + ₹${surcharge} surcharge)` : "Insufficient balance");
    }

    return txn;
  });

  const dispatched = await dispatchToProviders(transaction.id, identifier, amount, operatorCode, mappings);
  if (!dispatched) {
    // No vendor ever received it (all unreachable, disabled or out of float): safe to refund.
    return applyProviderResult(
      transaction.id,
      {
        status: "FAILED",
        providerRefId: null,
        vendorRefId: null,
        message: "All configured providers were unreachable",
        rawResponse: { error: "All configured providers were unreachable" },
      },
      mappings[0].apiProviderId
    );
  }
  return applyProviderResult(transaction.id, dispatched.result, dispatched.apiProviderId);
}

type MappingWithProvider = {
  apiProviderId: string;
  providerOperatorCode: string | null;
  apiProvider: ProviderTarget & { isActive: boolean; walletBalance: Prisma.Decimal; retryCount: number };
};

/**
 * Walks the operator's API 1→5 chain. Moves to the next API only when the vendor provably
 * never received the request (unreachable, disabled, out of float) — or, if the
 * "failoverOnFailure" setting is on, when a vendor answered with a definite FAILED.
 * A PENDING answer always stops here: sending it elsewhere could recharge twice.
 */
async function dispatchToProviders(
  transactionId: string,
  identifier: string,
  amount: number,
  operatorCode: string,
  mappings: MappingWithProvider[]
): Promise<{ result: ProviderResult; apiProviderId: string } | null> {
  const failoverSetting = await prisma.systemSetting.findUnique({ where: { key: "failoverOnFailure" } });
  const failoverOnFailure = failoverSetting?.value === "true";

  let last: { result: ProviderResult; apiProviderId: string } | null = null;
  for (const mapping of mappings) {
    const provider = mapping.apiProvider;
    if (!provider.isActive) continue;
    if (Number(provider.walletBalance) < amount) continue;

    let result: ProviderResult | null = null;
    const attempts = Math.max(1, provider.retryCount);
    for (let attempt = 0; attempt < attempts && !result; attempt++) {
      try {
        result = await sendRecharge(provider, {
          transactionId,
          mobile: identifier,
          amount,
          opcode: mapping.providerOperatorCode?.trim() || operatorCode,
        });
      } catch (err) {
        if (!(err instanceof ProviderDownError)) throw err;
      }
    }
    if (!result) continue;

    last = { result, apiProviderId: mapping.apiProviderId };
    if (result.status === "FAILED" && failoverOnFailure) continue;
    break;
  }
  return last;
}

/**
 * Records a vendor's answer, from whichever path it arrived (initial reply, callback,
 * status check, Send to API). PENDING just stores the references; SUCCESS/FAILED settle
 * the money. If another path already settled the transaction, this is a no-op that
 * returns the current state — callbacks routinely race the original HTTP reply.
 */
export async function applyProviderResult(transactionId: string, result: ProviderResult, apiProviderId: string) {
  if (result.status === "PENDING") {
    await prisma.transaction.updateMany({
      where: { id: transactionId, status: "PENDING" },
      data: {
        apiProviderId,
        vendorRefId: result.vendorRefId ?? undefined,
        providerRefId: result.providerRefId ?? undefined,
        statusMessage: result.message ?? undefined,
        apiResponse: result.rawResponse as Prisma.InputJsonValue,
      },
    });
    return prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
  }

  const txn = await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
  try {
    const settled = await settleTransaction(
      transactionId,
      txn.userId,
      labelFor(txn.type),
      {
        success: result.status === "SUCCESS",
        providerRefId: result.providerRefId,
        vendorRefId: result.vendorRefId,
        message: result.message,
        rawResponse: result.rawResponse,
      },
      apiProviderId
    );
    await notifyOutcome(settled.id);
    return settled;
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) {
      return prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    }
    throw err;
  }
}

/** Transaction alert SMS, honouring the settling provider's success/failure alert switches. */
async function notifyOutcome(transactionId: string) {
  const txn = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { apiProvider: true, user: { select: { phone: true } } },
  });
  if (!txn || (txn.status !== "SUCCESS" && txn.status !== "FAILED")) return;
  const shouldAlert = txn.status === "SUCCESS" ? txn.apiProvider.smsAlertOnSuccess : txn.apiProvider.smsAlertOnFailure;
  if (!shouldAlert) return;
  const statusText = txn.status === "SUCCESS" ? "successful" : "failed and refunded";
  await sendSms(
    txn.user.phone,
    `${labelFor(txn.type)} of Rs.${txn.amount} for ${txn.identifier} was ${statusText}. Ref: ${txn.providerRefId ?? "-"}`,
    "TRANSACTION_ALERT"
  ).catch((err) => console.error("transaction SMS failed", err));
}

export async function settleTransaction(
  transactionId: string,
  userId: string,
  descriptionLabel: string,
  result: {
    success: boolean;
    providerRefId: string | null;
    rawResponse: Record<string, unknown>;
    vendorRefId?: string | null;
    message?: string | null;
  },
  apiProviderId?: string
) {
  return prisma.$transaction(async (tx) => {
    // Atomic claim: only one settler (reply, callback, status check, admin) can move a
    // transaction out of PENDING. A plain read-then-write would let two of them both pay
    // out commission or both refund.
    const claimed = await tx.transaction.updateMany({
      where: { id: transactionId, status: "PENDING" },
      data: { status: result.success ? "SUCCESS" : "FAILED" },
    });
    const txn = await tx.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    if (claimed.count === 0) {
      throw new HttpError(409, `Transaction is already ${txn.status}`);
    }

    const common = {
      providerRefId: result.providerRefId ?? txn.providerRefId,
      vendorRefId: result.vendorRefId ?? txn.vendorRefId,
      statusMessage: result.message ?? null,
      apiResponse: result.rawResponse as Prisma.InputJsonValue,
      ...(apiProviderId ? { apiProviderId } : {}),
    };

    if (!result.success) {
      const updated = await tx.transaction.update({ where: { id: transactionId }, data: common });

      // Refund exactly what was taken — AEPS never debits the wallet (deduction 0).
      if (Number(txn.deduction) > 0) {
        const wallet = await tx.wallet.update({
          where: { userId },
          data: { balance: { increment: txn.deduction } },
        });
        await tx.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            type: "CREDIT",
            amount: txn.deduction,
            balanceAfter: wallet.balance,
            referenceType: "REFUND",
            referenceId: transactionId,
            description: `Refund for failed ${descriptionLabel.toLowerCase()} (${txn.identifier})`,
          },
        });
      }

      await enqueuePartnerCallback(tx, transactionId);
      return updated;
    }

    const updated = await tx.transaction.update({ where: { id: transactionId }, data: common });

    const settledProviderId = apiProviderId ?? txn.apiProviderId;
    const commission = await applySuccessRewards(tx, {
      transactionId,
      userId,
      operatorId: txn.operatorId,
      apiProviderId: settledProviderId,
      amount: Number(txn.amount),
      descriptionLabel,
      identifier: txn.identifier,
      // AEPS dispenses the customer's own bank money; no platform float is spent.
      depleteProviderWallet: txn.type !== "AEPS",
    });

    const final = commission > 0 ? await tx.transaction.update({ where: { id: transactionId }, data: { commission } }) : updated;
    await enqueuePartnerCallback(tx, transactionId);
    return final;
  });
}

/**
 * "Send to API" — re-submits a transaction that is still PENDING to a specific provider
 * (chosen by an admin, typically because the original provider never answered). The
 * user's wallet was already debited when the transaction was created, so this only calls
 * the provider and settles: success keeps the debit and pays rewards, failure refunds.
 */
export async function resendToProvider(transactionId: string, apiProviderId: string) {
  const txn = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { operator: { select: { code: true } } },
  });
  if (!txn) throw new HttpError(404, "Transaction not found");
  if (txn.status !== "PENDING") throw new HttpError(409, `Transaction is already ${txn.status}`);
  if (txn.type === "AEPS") throw new HttpError(400, "AEPS transactions cannot be re-sent to another API");

  const provider = await prisma.apiProvider.findUnique({ where: { id: apiProviderId } });
  if (!provider) throw new HttpError(404, "API provider not found");
  if (!provider.isActive) throw new HttpError(400, `${provider.name} is disabled`);
  if (Number(provider.walletBalance) < Number(txn.amount)) {
    throw new HttpError(400, `${provider.name} has insufficient Wallet 1 balance`);
  }

  const mapping = await prisma.operatorApiMapping.findFirst({
    where: { operatorId: txn.operatorId, apiProviderId },
    select: { providerOperatorCode: true },
  });

  let result: ProviderResult | null = null;
  const attempts = Math.max(1, provider.retryCount);
  for (let attempt = 0; attempt < attempts && !result; attempt++) {
    try {
      result = await sendRecharge(provider, {
        transactionId,
        mobile: txn.identifier,
        amount: Number(txn.amount),
        opcode: mapping?.providerOperatorCode?.trim() || txn.operator.code,
      });
    } catch (err) {
      if (!(err instanceof ProviderDownError)) throw err;
    }
  }
  if (!result) {
    // Provider unreachable: leave the transaction PENDING so it can be sent elsewhere,
    // rather than refunding a transaction that might still go through.
    throw new HttpError(502, `${provider.name} is unreachable — transaction left pending`);
  }

  return applyProviderResult(transactionId, result, apiProviderId);
}

/**
 * Asks the vendor holding a PENDING transaction for its outcome and applies it. Used by
 * the background poller, the admin "Check Status" button and the app's status screen.
 */
export async function checkPendingTransaction(transactionId: string) {
  const txn = await prisma.transaction.findUnique({ where: { id: transactionId }, include: { apiProvider: true } });
  if (!txn) throw new HttpError(404, "Transaction not found");
  if (txn.status !== "PENDING") return { transaction: txn, checked: false, reason: `Already ${txn.status}` };
  if (txn.type === "AEPS") return { transaction: txn, checked: false, reason: "AEPS has no status check" };

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { statusCheckCount: { increment: 1 }, lastStatusCheckAt: new Date() },
  });

  const result = await checkStatus(txn.apiProvider, {
    transactionId,
    vendorRefId: txn.vendorRefId,
    mobile: txn.identifier,
    amount: Number(txn.amount),
    createdAt: txn.createdAt,
  });
  if (!result) {
    return { transaction: txn, checked: false, reason: `${txn.apiProvider.name} has no status-check URL configured` };
  }
  if (result.status === "PENDING") {
    return { transaction: await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } }), checked: true, reason: result.message ?? "Still pending at vendor" };
  }
  return { transaction: await applyProviderResult(transactionId, result, txn.apiProviderId), checked: true, reason: null };
}

function labelFor(type: string) {
  return type === "BBPS" ? "Bill payment" : type === "DMT" ? "Money transfer" : "Recharge";
}

/**
 * Refunds a transaction that was already SUCCESS (e.g. the operator later reversed it or
 * a complaint was upheld). Everything the success path paid out is reversed from the
 * ledger itself — commission, cashback and referral reward are debited back from whoever
 * received them, the vendor float is credited back, and the user gets the full amount.
 */
export async function refundSuccessfulTransaction(transactionId: string, remark?: string) {
  return prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    if (txn.status !== "SUCCESS") {
      throw new HttpError(409, `Only SUCCESS transactions can be refunded (this one is ${txn.status})`);
    }

    const rewardEntries = await tx.ledgerEntry.findMany({
      where: {
        referenceId: transactionId,
        type: "CREDIT",
        referenceType: { in: ["COMMISSION", "CASHBACK", "REFERRAL_REWARD"] },
      },
    });
    for (const entry of rewardEntries) {
      const wallet = await tx.wallet.update({
        where: { id: entry.walletId },
        data: { balance: { decrement: entry.amount } },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: "DEBIT",
          amount: entry.amount,
          balanceAfter: wallet.balance,
          referenceType: "ADJUSTMENT",
          referenceId: transactionId,
          description: `Reversal of ${entry.referenceType.toLowerCase().replace("_", " ")} — transaction refunded`,
        },
      });
    }

    // AEPS never debited the user's wallet (deduction 0), so only refund what was taken.
    if (Number(txn.deduction) > 0) {
      const wallet = await tx.wallet.update({
        where: { userId: txn.userId },
        data: { balance: { increment: txn.deduction } },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: "CREDIT",
          amount: txn.deduction,
          balanceAfter: wallet.balance,
          referenceType: "REFUND",
          referenceId: transactionId,
          description: `Refund for ${txn.type.toLowerCase()} ${txn.identifier}${remark ? ` — ${remark}` : ""}`,
        },
      });
    }

    const floatDebits = await tx.providerWalletEntry.findMany({
      where: { referenceId: transactionId, walletSlot: 1, type: "DEBIT" },
    });
    for (const entry of floatDebits) {
      const provider = await tx.apiProvider.update({
        where: { id: entry.apiProviderId },
        data: { walletBalance: { increment: entry.amount } },
      });
      await tx.providerWalletEntry.create({
        data: {
          apiProviderId: entry.apiProviderId,
          walletSlot: 1,
          type: "CREDIT",
          amount: entry.amount,
          balanceAfter: provider.walletBalance,
          referenceId: transactionId,
          description: `Float returned — transaction refunded (${txn.identifier})`,
        },
      });
    }

    await tx.commissionPayout.updateMany({ where: { transactionId }, data: { reversed: true } });

    const refunded = await tx.transaction.update({
      where: { id: transactionId },
      data: { status: "REFUNDED", commission: 0, vendorCommission: 0 },
    });
    await enqueuePartnerCallback(tx, transactionId);
    return refunded;
  });
}
