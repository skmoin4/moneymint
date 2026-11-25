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
    include: {
      slabs: { include: { operator: true }, orderBy: [{ operator: { name: "asc" } }, { minAmount: "asc" }] },
      _count: { select: { users: true } },
    },
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

const slabSchema = z
  .object({
    operatorId: z.string().uuid(),
    chargeType: z.enum(["COMMISSION", "SURCHARGE"]).default("COMMISSION"),
    commissionType: z.enum(["PERCENT", "FLAT"]),
    value: z.number().min(0).max(100000),
    minAmount: z.number().min(0).nullable().optional(),
    maxAmount: z.number().min(0).nullable().optional(),
  })
  .refine((v) => v.commissionType !== "PERCENT" || v.value <= 100, "A percentage can't exceed 100")
  .refine((v) => v.minAmount == null || v.maxAmount == null || v.minAmount <= v.maxAmount, "Min amount must be ≤ max amount");

async function requirePack(packId: string) {
  const pack = await prisma.commissionPack.findUnique({ where: { id: packId } });
  if (!pack) throw new HttpError(404, "Commission pack not found");
  return pack;
}

/** Overlapping ranges for the same operator would make the applied rate ambiguous. */
async function assertNoOverlap(packId: string, operatorId: string, min: number | null, max: number | null, ignoreId?: string) {
  const others = await prisma.commissionSlab.findMany({ where: { packId, operatorId, ...(ignoreId ? { id: { not: ignoreId } } : {}) } });
  const lo = min ?? 0;
  const hi = max ?? Number.POSITIVE_INFINITY;
  for (const o of others) {
    const olo = o.minAmount === null ? 0 : Number(o.minAmount);
    const ohi = o.maxAmount === null ? Number.POSITIVE_INFINITY : Number(o.maxAmount);
    const sameWidth = (min === null && max === null) === (o.minAmount === null && o.maxAmount === null);
    // A catch-all slab (no range) may coexist with ranged ones — ranged slabs win.
    if (sameWidth && lo <= ohi && olo <= hi) {
      throw new HttpError(409, `This range overlaps an existing slab (${o.minAmount ?? "any"}–${o.maxAmount ?? "any"})`);
    }
  }
}

commissionRouter.post("/:packId/slabs", authorize("ADMIN"), async (req, res) => {
  const parsed = slabSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const pack = await requirePack(String(req.params.packId));
  const d = parsed.data;
  await assertNoOverlap(pack.id, d.operatorId, d.minAmount ?? null, d.maxAmount ?? null);
  const slab = await prisma.commissionSlab.create({
    data: { packId: pack.id, operatorId: d.operatorId, chargeType: d.chargeType, commissionType: d.commissionType, value: d.value, minAmount: d.minAmount ?? null, maxAmount: d.maxAmount ?? null },
    include: { operator: true },
  });
  res.status(201).json({ slab });
});

commissionRouter.patch("/:packId/slabs/:slabId", authorize("ADMIN"), async (req, res) => {
  const parsed = slabSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const existing = await prisma.commissionSlab.findFirst({ where: { id: String(req.params.slabId), packId: String(req.params.packId) } });
  if (!existing) throw new HttpError(404, "Slab not found");
  const d = parsed.data;
  await assertNoOverlap(existing.packId, d.operatorId, d.minAmount ?? null, d.maxAmount ?? null, existing.id);
  const slab = await prisma.commissionSlab.update({
    where: { id: existing.id },
    data: { operatorId: d.operatorId, chargeType: d.chargeType, commissionType: d.commissionType, value: d.value, minAmount: d.minAmount ?? null, maxAmount: d.maxAmount ?? null },
    include: { operator: true },
  });
  res.json({ slab });
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

const bulkSchema = z.object({
  operatorType: z.string().min(1),
  chargeType: z.enum(["COMMISSION", "SURCHARGE"]),
  commissionType: z.enum(["PERCENT", "FLAT"]),
  value: z.number().min(0).max(100000),
});

// "Set for all Prepaid operators at 2.5%" — replaces the catch-all (no range) slab of every
// operator of that type in this pack. Ranged slabs are left alone.
commissionRouter.post("/:packId/bulk", authorize("ADMIN"), async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const pack = await requirePack(String(req.params.packId));
  const d = parsed.data;
  if (d.commissionType === "PERCENT" && d.value > 100) throw new HttpError(400, "A percentage can't exceed 100");
  const operators = await prisma.operator.findMany({ where: { type: d.operatorType }, select: { id: true } });
  await prisma.$transaction([
    prisma.commissionSlab.deleteMany({
      where: { packId: pack.id, operatorId: { in: operators.map((o) => o.id) }, minAmount: null, maxAmount: null },
    }),
    prisma.commissionSlab.createMany({
      data: operators.map((o) => ({ packId: pack.id, operatorId: o.id, chargeType: d.chargeType, commissionType: d.commissionType, value: d.value })),
    }),
  ]);
  res.json({ updated: operators.length });
});

const cloneSchema = z.object({ name: z.string().min(2) });

// Copy a pack (all slabs + global rate) as the starting point for another level's pack.
commissionRouter.post("/:packId/clone", authorize("ADMIN"), async (req, res) => {
  const parsed = cloneSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const source = await prisma.commissionPack.findUnique({ where: { id: String(req.params.packId) }, include: { slabs: true } });
  if (!source) throw new HttpError(404, "Commission pack not found");
  if (await prisma.commissionPack.findUnique({ where: { name: parsed.data.name } })) {
    throw new HttpError(409, "A pack with this name already exists");
  }
  const pack = await prisma.commissionPack.create({
    data: {
      name: parsed.data.name,
      globalCommissionType: source.globalCommissionType,
      globalValue: source.globalValue,
      slabs: {
        create: source.slabs.map((s) => ({
          operatorId: s.operatorId,
          chargeType: s.chargeType,
          commissionType: s.commissionType,
          value: s.value,
          minAmount: s.minAmount,
          maxAmount: s.maxAmount,
        })),
      },
    },
  });
  res.status(201).json({ pack });
});

commissionRouter.delete("/:packId", authorize("ADMIN"), async (req, res) => {
  const packId = String(req.params.packId);
  const inUse = await prisma.user.count({ where: { commissionPackId: packId } });
  if (inUse > 0) throw new HttpError(409, `${inUse} user(s) are on this pack — move them to another pack first`);
  await prisma.$transaction([
    prisma.commissionSlab.deleteMany({ where: { packId } }),
    prisma.commissionPack.delete({ where: { id: packId } }),
  ]);
  res.status(204).send();
});

function dateRange(q: Record<string, unknown>) {
  const from = typeof q.from === "string" && !isNaN(Date.parse(q.from)) ? new Date(q.from) : undefined;
  let to: Date | undefined;
  if (typeof q.to === "string" && !isNaN(Date.parse(q.to))) {
    to = new Date(q.to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.to)) to.setHours(23, 59, 59, 999);
  }
  return from || to ? { gte: from, lte: to } : undefined;
}

// Commission Distribution Report: who earned how much (gross, TDS, net) across the
// caller's downline, plus — for ADMIN — the platform's own margin on the same period.
commissionRouter.get("/distribution-report", async (req, res) => {
  const isAdmin = req.user!.role === "ADMIN";
  const descendantIds = await getDescendantUserIds(req.user!.userId);
  const userIds = [req.user!.userId, ...descendantIds];
  const createdAt = dateRange(req.query as Record<string, unknown>);

  const payoutWhere = { reversed: false, ...(isAdmin ? {} : { userId: { in: userIds } }), ...(createdAt ? { createdAt } : {}) };
  const grouped = await prisma.commissionPayout.groupBy({
    by: ["userId"],
    where: payoutWhere,
    _sum: { gross: true, tds: true, net: true },
    _count: { _all: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, name: true, phone: true, role: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));
  const rows = grouped
    .map((g) => ({
      user: userMap.get(g.userId),
      count: g._count._all,
      gross: Number(g._sum.gross ?? 0),
      tds: Number(g._sum.tds ?? 0),
      net: Number(g._sum.net ?? 0),
    }))
    .sort((a, b) => b.gross - a.gross);

  let platform = null;
  if (isAdmin) {
    const txnWhere = { status: "SUCCESS" as const, ...(createdAt ? { createdAt } : {}) };
    const [txnAgg, payoutAgg, cashbackAgg, referralAgg, rentAgg] = await Promise.all([
      prisma.transaction.aggregate({ where: txnWhere, _sum: { amount: true, vendorCommission: true, surcharge: true }, _count: { _all: true } }),
      prisma.commissionPayout.aggregate({ where: payoutWhere, _sum: { gross: true, tds: true } }),
      prisma.ledgerEntry.aggregate({ where: { referenceType: "CASHBACK", type: "CREDIT", ...(createdAt ? { createdAt } : {}) }, _sum: { amount: true } }),
      prisma.ledgerEntry.aggregate({ where: { referenceType: "REFERRAL_REWARD", type: "CREDIT", ...(createdAt ? { createdAt } : {}) }, _sum: { amount: true } }),
      prisma.ledgerEntry.aggregate({ where: { referenceType: "RENT", type: "DEBIT", ...(createdAt ? { createdAt } : {}) }, _sum: { amount: true } }),
    ]);
    const vendorCommission = Number(txnAgg._sum.vendorCommission ?? 0);
    const surcharge = Number(txnAgg._sum.surcharge ?? 0);
    const paidOut = Number(payoutAgg._sum.gross ?? 0);
    const cashback = Number(cashbackAgg._sum.amount ?? 0);
    const referral = Number(referralAgg._sum.amount ?? 0);
    const rent = Number(rentAgg._sum.amount ?? 0);
    platform = {
      successCount: txnAgg._count._all,
      volume: Number(txnAgg._sum.amount ?? 0),
      vendorCommission,
      surcharge,
      paidOut,
      tdsWithheld: Number(payoutAgg._sum.tds ?? 0),
      cashback,
      referral,
      rent,
      netMargin: Math.round((vendorCommission + surcharge - paidOut - cashback - referral - rent) * 100) / 100,
    };
  }

  res.json({ rows, platform });
});

// Per-transaction breakdown: who earned what on one transaction.
commissionRouter.get("/payouts/:transactionId", async (req, res) => {
  const payouts = await prisma.commissionPayout.findMany({
    where: { transactionId: String(req.params.transactionId) },
    orderBy: { level: "asc" },
    include: { user: { select: { name: true, phone: true } } },
  });
  if (req.user!.role === "ADMIN") {
    res.json({ payouts });
    return;
  }
  // Managers see only the share of the chain at or below themselves.
  const scope = new Set([req.user!.userId, ...(await getDescendantUserIds(req.user!.userId))]);
  res.json({ payouts: payouts.filter((p) => scope.has(p.userId)) });
});
