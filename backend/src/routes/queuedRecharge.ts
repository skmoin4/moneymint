import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { getDescendantUserIds } from "../utils/hierarchy";
import { initiateRecharge } from "../services/rechargeService";

export const queuedRechargeRouter = Router();

queuedRechargeRouter.use(authenticate);

const createSchema = z.object({
  userId: z.string().uuid(),
  operatorCode: z.string().min(2),
  identifier: z.string().min(3).max(20),
  amount: z.number().positive(),
  scheduledFor: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid date"),
});

// Queue a recharge to run later instead of immediately — mirrors AP Money's "Q Recharge".
// There's no background worker in this dev environment, so queued jobs run lazily: whenever
// this list is fetched, any entry whose scheduledFor time has passed is auto-processed.
queuedRechargeRouter.post("/", authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const descendantIds = await getDescendantUserIds(req.user!.userId);
  if (parsed.data.userId !== req.user!.userId && !descendantIds.includes(parsed.data.userId)) {
    throw new HttpError(403, "You can only queue recharges for users in your own downline");
  }
  const queued = await prisma.queuedRecharge.create({
    data: { ...parsed.data, scheduledFor: new Date(parsed.data.scheduledFor) },
  });
  res.status(201).json({ queued });
});

async function processDueEntries(scopeUserIds: string[]) {
  const due = await prisma.queuedRecharge.findMany({
    where: { userId: { in: scopeUserIds }, status: "QUEUED", scheduledFor: { lte: new Date() } },
  });
  for (const entry of due) {
    try {
      const result = await initiateRecharge(entry.userId, entry.operatorCode, entry.identifier, Number(entry.amount));
      await prisma.queuedRecharge.update({
        where: { id: entry.id },
        data: {
          status: result.status === "SUCCESS" ? "PROCESSED" : "FAILED",
          resultMessage: `Transaction ${result.status}`,
          transactionId: result.id,
        },
      });
    } catch (err) {
      await prisma.queuedRecharge.update({
        where: { id: entry.id },
        data: { status: "FAILED", resultMessage: err instanceof Error ? err.message : "Processing failed" },
      });
    }
  }
}

queuedRechargeRouter.get("/", authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"), async (req, res) => {
  const descendantIds = await getDescendantUserIds(req.user!.userId);
  const userIds = [req.user!.userId, ...descendantIds];

  await processDueEntries(userIds);

  const entries = await prisma.queuedRecharge.findMany({
    where: { userId: { in: userIds } },
    orderBy: { scheduledFor: "desc" },
    take: 200,
    include: { user: { select: { name: true, phone: true } } },
  });
  res.json({ entries });
});

queuedRechargeRouter.post(
  "/:id/cancel",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const entry = await prisma.queuedRecharge.findUnique({ where: { id: String(req.params.id) } });
    if (!entry) {
      throw new HttpError(404, "Queued recharge not found");
    }
    const descendantIds = await getDescendantUserIds(req.user!.userId);
    if (entry.userId !== req.user!.userId && !descendantIds.includes(entry.userId)) {
      throw new HttpError(403, "You can only cancel entries within your own downline");
    }
    if (entry.status !== "QUEUED") {
      throw new HttpError(409, `Cannot cancel a ${entry.status.toLowerCase()} entry`);
    }
    const updated = await prisma.queuedRecharge.update({
      where: { id: entry.id },
      data: { status: "CANCELLED" },
    });
    res.json({ queued: updated });
  }
);
