import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { settleTransaction } from "../services/transactionEngine";

export const manualTxnRouter = Router();

manualTxnRouter.use(authenticate, authorize("ADMIN"));

const singleSchema = z.object({
  userId: z.string().uuid(),
  operatorCode: z.string().min(2),
  identifier: z.string().min(3).max(20),
  amount: z.number().positive(),
  outcome: z.enum(["SUCCESS", "FAILED"]),
  remark: z.string().optional(),
});

async function createAndSettle(
  input: z.infer<typeof singleSchema>
): Promise<{ ok: true; transactionId: string } | { ok: false; error: string }> {
  const operator = await prisma.operator.findUnique({ where: { code: input.operatorCode } });
  if (!operator) return { ok: false, error: `Operator ${input.operatorCode} not found` };

  const primaryMapping = await prisma.operatorApiMapping.findFirst({
    where: { operatorId: operator.id },
    orderBy: { priority: "asc" },
  });
  if (!primaryMapping) return { ok: false, error: `${operator.name} has no provider configured` };

  try {
    const txn = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { userId: input.userId },
        data: { balance: { decrement: input.amount } },
      });
      if (wallet.balance.lessThan(0)) {
        throw new HttpError(400, "Insufficient balance");
      }
      const created = await tx.transaction.create({
        data: {
          userId: input.userId,
          type: "RECHARGE",
          operatorId: operator.id,
          apiProviderId: primaryMapping.apiProviderId,
          identifier: input.identifier,
          amount: input.amount,
          deduction: input.amount,
          status: "PENDING",
        },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: "DEBIT",
          amount: input.amount,
          balanceAfter: wallet.balance,
          referenceType: "RECHARGE",
          referenceId: created.id,
          description: `Manual entry: ${input.identifier} (${operator.name})${input.remark ? ` — ${input.remark}` : ""}`,
        },
      });
      return created;
    });

    await settleTransaction(txn.id, input.userId, "Manual entry", {
      success: input.outcome === "SUCCESS",
      providerRefId: null,
      rawResponse: { manualEntry: true, remark: input.remark ?? null },
    });

    return { ok: true, transactionId: txn.id };
  } catch (err) {
    return { ok: false, error: err instanceof HttpError ? err.message : "Could not create transaction" };
  }
}

manualTxnRouter.post("/single", async (req, res) => {
  const parsed = singleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const result = await createAndSettle(parsed.data);
  if (!result.ok) {
    throw new HttpError(400, result.error);
  }
  res.status(201).json(result);
});

const masterSchema = z.object({
  entries: z.array(singleSchema).min(1).max(200),
});

manualTxnRouter.post("/master", async (req, res) => {
  const parsed = masterSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const results = [];
  for (const entry of parsed.data.entries) {
    results.push({ ...(await createAndSettle(entry)), identifier: entry.identifier });
  }
  res.json({ results, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
});
