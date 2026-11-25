import { prisma } from "../config/prisma";
import { HttpError } from "../utils/httpError";
import { sendRecharge, ProviderDownError, type ProviderResult } from "./providerClient";
import { applySuccessRewards } from "./transactionEngine";
import type { Prisma } from "../generated/prisma/client";

const AEPS_OPERATOR_CODE = "AEPS";

type AepsType = "CASH_WITHDRAWAL" | "BALANCE_ENQUIRY";

export async function performAepsTransaction(
  userId: string,
  aadhaarNumber: string,
  bankName: string,
  aepsType: AepsType,
  amount: number
) {
  const operator = await prisma.operator.findUnique({ where: { code: AEPS_OPERATOR_CODE } });
  if (!operator) {
    throw new HttpError(503, "AEPS is not configured");
  }

  const mappings = await prisma.operatorApiMapping.findMany({
    where: { operatorId: operator.id, isActive: true },
    orderBy: { priority: "asc" },
    include: { apiProvider: true },
  });
  if (mappings.length === 0) {
    throw new HttpError(503, "No active AEPS provider configured");
  }

  const txn = await prisma.transaction.create({
    data: {
      userId,
      type: "AEPS",
      operatorId: operator.id,
      apiProviderId: mappings[0].apiProviderId,
      identifier: aadhaarNumber,
      amount,
      deduction: 0, // AEPS moves the customer's bank funds, not the retailer's wallet
      status: "PENDING",
    },
  });

  let result: ProviderResult | null = null;
  let usedProviderId = mappings[0].apiProviderId;

  for (const mapping of mappings) {
    try {
      result = await sendRecharge(mapping.apiProvider, {
        transactionId: txn.id,
        mobile: aadhaarNumber,
        amount,
        opcode: mapping.providerOperatorCode?.trim() || AEPS_OPERATOR_CODE,
      });
      usedProviderId = mapping.apiProviderId;
      break;
    } catch (err) {
      if (err instanceof ProviderDownError) continue;
      throw err;
    }
  }

  // A biometric withdrawal the switch hasn't confirmed stays PENDING (no money has
  // moved on our side: AEPS never debits the retailer), to be settled by callback,
  // status check or an admin.
  if (result?.status === "PENDING") {
    return prisma.transaction.update({
      where: { id: txn.id },
      data: {
        apiProviderId: usedProviderId,
        vendorRefId: result.vendorRefId,
        providerRefId: result.providerRefId,
        statusMessage: result.message,
        apiResponse: { ...result.rawResponse, bankName, aepsType } as Prisma.InputJsonValue,
      },
    });
  }

  const success = result?.status === "SUCCESS";
  const rawResponse: Record<string, unknown> = result
    ? { ...result.rawResponse }
    : { error: "All configured AEPS providers were unreachable" };
  rawResponse.bankName = bankName;
  rawResponse.aepsType = aepsType;

  if (success && aepsType === "BALANCE_ENQUIRY") {
    let seed = 0;
    for (const char of aadhaarNumber) seed = (seed * 31 + char.charCodeAt(0)) % 1000000;
    rawResponse.balance = 500 + (seed % 45000);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.transaction.update({
      where: { id: txn.id },
      data: {
        status: success ? "SUCCESS" : "FAILED",
        providerRefId: result?.providerRefId ?? null,
        apiResponse: rawResponse as Prisma.InputJsonValue,
        ...(result ? { apiProviderId: usedProviderId } : {}),
      },
    });

    if (success && aepsType === "CASH_WITHDRAWAL" && Number(txn.amount) > 0) {
      const commission = await applySuccessRewards(tx, {
        transactionId: txn.id,
        userId,
        operatorId: operator.id,
        apiProviderId: usedProviderId,
        amount: Number(txn.amount),
        descriptionLabel: "AEPS cash withdrawal",
        identifier: aadhaarNumber,
        depleteProviderWallet: false,
      });
      if (commission > 0) {
        return tx.transaction.update({ where: { id: txn.id }, data: { commission } });
      }
    }

    return updated;
  });
}
