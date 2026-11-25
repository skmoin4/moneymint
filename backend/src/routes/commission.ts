import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { getDescendantUserIds } from "../utils/hierarchy";

export const commissionRouter = Router();

commissionRouter.use(authenticate, authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"));

commissionRouter.get("/", async (_req, res) => {
  const packs = await prisma.commissionPack.findMany({
    include: { slabs: { include: { operator: true } } },
    orderBy: { name: "asc" },
  });
  res.json({ packs });
});

const createPackSchema = z.object({
  name: z.string().min(2),
});

commissionRouter.post("/", authorize("ADMIN"), async (req, res) => {
  const parsed = createPackSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const existing = await prisma.commissionPack.findUnique({ where: { name: parsed.data.name } });
  if (existing) {
    throw new HttpError(409, "A pack with this name already exists");
  }
  const pack = await prisma.commissionPack.create({ data: parsed.data });
  res.status(201).json({ pack });
});

const globalRateSchema = z.object({
  commissionType: z.enum(["PERCENT", "FLAT"]).nullable(),
  value: z.number().min(0).nullable(),
});

// Fallback rate applied to any operator that has no specific slab in this pack.
commissionRouter.put("/:packId/global-rate", authorize("ADMIN"), async (req, res) => {
  const parsed = globalRateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const pack = await prisma.commissionPack
    .update({
      where: { id: String(req.params.packId) },
      data: { globalCommissionType: parsed.data.commissionType, globalValue: parsed.data.value },
    })
    .catch(() => null);
  if (!pack) {
    throw new HttpError(404, "Commission pack not found");
  }
  res.json({ pack });
});

const upsertSlabSchema = z.object({
  operatorId: z.string().uuid(),
  commissionType: z.enum(["PERCENT", "FLAT"]),
  value: z.number().min(0),
});

commissionRouter.put("/:packId/slabs", authorize("ADMIN"), async (req, res) => {
  const parsed = upsertSlabSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const pack = await prisma.commissionPack.findUnique({ where: { id: String(req.params.packId) } });
  if (!pack) {
    throw new HttpError(404, "Commission pack not found");
  }

  const slab = await prisma.commissionSlab.upsert({
    where: {
      packId_operatorId: { packId: pack.id, operatorId: parsed.data.operatorId },
    },
    update: { commissionType: parsed.data.commissionType, value: parsed.data.value },
    create: { packId: pack.id, ...parsed.data },
    include: { operator: true },
  });
  res.status(201).json({ slab });
});

commissionRouter.delete("/:packId/slabs/:slabId", authorize("ADMIN"), async (req, res) => {
  const slab = await prisma.commissionSlab
    .delete({ where: { id: String(req.params.slabId), packId: String(req.params.packId) } })
    .catch(() => null);
  if (!slab) {
    throw new HttpError(404, "Slab not found");
  }
  res.status(204).send();
});

// Aggregates COMMISSION ledger credits across the caller's downline, grouped by operator.
commissionRouter.get("/distribution-report", async (req, res) => {
  const descendantIds = await getDescendantUserIds(req.user!.userId);
  const userIds = [req.user!.userId, ...descendantIds];

  const entries = await prisma.ledgerEntry.findMany({
    where: { referenceType: "COMMISSION", wallet: { userId: { in: userIds } } },
    select: { amount: true, referenceId: true },
  });

  const txnIds = entries.map((e) => e.referenceId).filter((id): id is string => Boolean(id));
  const transactions = await prisma.transaction.findMany({
    where: { id: { in: txnIds } },
    select: { id: true, operatorId: true, operator: { select: { name: true } } },
  });
  const txnMap = new Map(transactions.map((t) => [t.id, t]));

  const grouped = new Map<string, { operatorName: string; count: number; totalCommission: number }>();
  for (const e of entries) {
    const txn = e.referenceId ? txnMap.get(e.referenceId) : undefined;
    const key = txn?.operatorId ?? "unknown";
    const name = txn?.operator.name ?? "Unknown";
    if (!grouped.has(key)) grouped.set(key, { operatorName: name, count: 0, totalCommission: 0 });
    const g = grouped.get(key)!;
    g.count++;
    g.totalCommission += Number(e.amount);
  }

  res.json({ report: Array.from(grouped.values()).sort((a, b) => b.totalCommission - a.totalCommission) });
});
