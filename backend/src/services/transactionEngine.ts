import { prisma } from "../config/prisma";
import { HttpError } from "../utils/httpError";
import { callProvider, ProviderDownError, ProviderResult } from "./mockProviderService";
import { sendSms } from "./smsService";
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
 * the vendor's operational float, pay commission (with pack-level global fallback), apply
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
  if (depleteProviderWallet) {
    const providerWallet = await tx.apiProvider.update({
      where: { id: apiProviderId },
      data: { walletBalance: { decrement: amount } },
    });
    await tx.providerWalletEntry.create({
      data: {
        apiProviderId,
        walletSlot: 1,
        type: "DEBIT",
        amount,
        balanceAfter: providerWallet.walletBalance,
        referenceId: transactionId,
        description: `${descriptionLabel} settled (${identifier})`,
      },
    });
  }

  const user = await tx.user.findUnique({
    where: { id: userId },
    include: {
      commissionPack: {
        include: { slabs: { where: { operatorId } } },
      },
    },
  });

  const slab = user?.commissionPack?.slabs[0];
  // Fall back to the pack's global rate when no operator-specific slab is configured.
  const rate = slab
    ? { commissionType: slab.commissionType, value: slab.value }
    : user?.commissionPack?.globalCommissionType && user.commissionPack.globalValue != null
      ? { commissionType: user.commissionPack.globalCommissionType, value: user.commissionPack.globalValue }
      : null;

  let commission = 0;
  if (rate) {
    const raw = rate.commissionType === "PERCENT" ? amount * (Number(rate.value) / 100) : Number(rate.value);
    commission = Math.round(raw * 100) / 100;

    if (commission > 0) {
      const wallet = await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: commission } },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: "CREDIT",
          amount: commission,
          balanceAfter: wallet.balance,
          referenceType: "COMMISSION",
          referenceId: transactionId,
          description: `Commission for ${descriptionLabel.toLowerCase()} (${identifier})`,
        },
      });
    }
  }

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

  const transaction = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.update({
      where: { userId },
      data: { balance: { decrement: amount } },
    });
    if (wallet.balance.lessThan(0)) {
      throw new HttpError(400, "Insufficient balance");
    }

    const txn = await tx.transaction.create({
      data: {
        userId,
        type: transactionType,
        operatorId: operator.id,
        apiProviderId: mappings[0].apiProviderId,
        identifier,
        amount,
        deduction: amount,
        status: "PENDING",
        source,
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

    return txn;
  });

  let result: ProviderResult | null = null;
  let usedProviderId = mappings[0].apiProviderId;
  let usedProvider = mappings[0].apiProvider;

  outer: for (const mapping of mappings) {
    // A provider with insufficient operational (Wallet 1) float can't actually fulfill the
    // transaction with the real vendor — skip it in the failover chain, same as if it were down.
    if (Number(mapping.apiProvider.walletBalance) < amount) {
      continue;
    }
    const attempts = Math.max(1, mapping.apiProvider.retryCount);
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        result = await callProvider(mapping.apiProvider.code, {
          mobileNumber: identifier,
          amount,
          operatorCode,
        });
        usedProviderId = mapping.apiProviderId;
        usedProvider = mapping.apiProvider;
        break outer;
      } catch (err) {
        if (err instanceof ProviderDownError) {
          continue;
        }
        throw err;
      }
    }
  }

  const settled = result
    ? await settleTransaction(transaction.id, userId, descriptionLabel, result, usedProviderId)
    : await settleTransaction(transaction.id, userId, descriptionLabel, {
        success: false,
        providerRefId: null,
        rawResponse: { error: "All configured providers were unreachable" },
      });

  const shouldAlert = settled.status === "SUCCESS" ? usedProvider.smsAlertOnSuccess : usedProvider.smsAlertOnFailure;
  const user = shouldAlert
    ? await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
    : null;
  if (user) {
    const statusText = settled.status === "SUCCESS" ? "successful" : "failed and refunded";
    await sendSms(
      user.phone,
      `${descriptionLabel} of Rs.${amount} for ${identifier} was ${statusText}. Ref: ${settled.providerRefId ?? "-"}`,
      "TRANSACTION_ALERT"
    );
  }

  return settled;
}

export async function settleTransaction(
  transactionId: string,
  userId: string,
  descriptionLabel: string,
  result: { success: boolean; providerRefId: string | null; rawResponse: Record<string, unknown> },
  apiProviderId?: string
) {
  return prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    if (txn.status !== "PENDING") {
      throw new HttpError(409, `Transaction is already ${txn.status}`);
    }

    if (!result.success) {
      const updated = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: "FAILED",
          providerRefId: result.providerRefId,
          apiResponse: result.rawResponse as Prisma.InputJsonValue,
          ...(apiProviderId ? { apiProviderId } : {}),
        },
      });

      const wallet = await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: txn.amount } },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: "CREDIT",
          amount: txn.amount,
          balanceAfter: wallet.balance,
          referenceType: "REFUND",
          referenceId: transactionId,
          description: `Refund for failed ${descriptionLabel.toLowerCase()} (${txn.identifier})`,
        },
      });

      return updated;
    }

    const updated = await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status: "SUCCESS",
        providerRefId: result.providerRefId,
        apiResponse: result.rawResponse as Prisma.InputJsonValue,
        ...(apiProviderId ? { apiProviderId } : {}),
      },
    });

    const settledProviderId = apiProviderId ?? txn.apiProviderId;
    const commission = await applySuccessRewards(tx, {
      transactionId,
      userId,
      operatorId: txn.operatorId,
      apiProviderId: settledProviderId,
      amount: Number(txn.amount),
      descriptionLabel,
      identifier: txn.identifier,
    });

    return commission > 0
      ? tx.transaction.update({ where: { id: transactionId }, data: { commission } })
      : updated;
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

  let result: ProviderResult | null = null;
  const attempts = Math.max(1, provider.retryCount);
  for (let attempt = 0; attempt < attempts && !result; attempt++) {
    try {
      result = await callProvider(provider.code, {
        mobileNumber: txn.identifier,
        amount: Number(txn.amount),
        operatorCode: txn.operator.code,
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

  return settleTransaction(transactionId, txn.userId, labelFor(txn.type), result, apiProviderId);
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

    return tx.transaction.update({
      where: { id: transactionId },
      data: { status: "REFUNDED", commission: 0 },
    });
  });
}
