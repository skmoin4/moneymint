import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { initiateRecharge } from "../services/rechargeService";
import { prisma } from "../config/prisma";
import { toCsv } from "../utils/csv";
import { transactionLimiter } from "../middleware/rateLimiters";
import { getDescendantUserIds } from "../utils/hierarchy";
import { settleTransaction } from "../services/transactionEngine";
import { requirePinIfEnabled } from "../middleware/requirePin";

export const rechargeRouter = Router();

rechargeRouter.use(authenticate);

const rechargeSchema = z.object({
  operatorCode: z.string().min(2),
  mobileNumber: z.string().min(10).max(15),
  amount: z.number().positive(),
});

rechargeRouter.post("/", transactionLimiter, requirePinIfEnabled, async (req, res) => {
  const parsed = rechargeSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const { operatorCode, mobileNumber, amount } = parsed.data;
  const transaction = await initiateRecharge(req.user!.userId, operatorCode, mobileNumber, amount);
  res.status(201).json({ transaction });
});

const STATUS_VALUES = ["PENDING", "SUCCESS", "FAILED", "REFUNDED"];
const TYPE_VALUES = ["RECHARGE", "BBPS", "DMT", "AEPS"];

function buildTransactionFilter(userId: string, query: Record<string, unknown>) {
  const where: Record<string, unknown> = { userId };

  const status = query.status;
  if (typeof status === "string" && STATUS_VALUES.includes(status)) {
    where.status = status;
  }

  const type = query.type;
  if (typeof type === "string" && TYPE_VALUES.includes(type)) {
    where.type = type;
  }

  const search = query.search;
  if (typeof search === "string" && search.trim()) {
    where.identifier = { contains: search.trim(), mode: "insensitive" };
  }

  const from = query.from;
  const to = query.to;
  if (typeof from === "string" || typeof to === "string") {
    const createdAt: Record<string, Date> = {};
    if (typeof from === "string" && !isNaN(Date.parse(from))) createdAt.gte = new Date(from);
    if (typeof to === "string" && !isNaN(Date.parse(to))) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
  }

  return where;
}

rechargeRouter.get("/history", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const where = buildTransactionFilter(req.user!.userId, req.query as Record<string, unknown>);

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { operator: true, apiProvider: true },
    }),
    prisma.transaction.count({ where }),
  ]);

  res.json({ transactions, total, page, pageSize });
});

rechargeRouter.get("/history/export", async (req, res) => {
  const where = buildTransactionFilter(req.user!.userId, req.query as Record<string, unknown>);
  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: { operator: true, apiProvider: true },
  });

  const rows = transactions.map((t) => ({
    date: t.createdAt.toISOString(),
    type: t.type,
    identifier: t.identifier,
    operator: t.operator.name,
    provider: t.apiProvider.name,
    amount: t.amount.toString(),
    commission: t.commission.toString(),
    status: t.status,
    providerRefId: t.providerRefId ?? "",
  }));

  const csv = toCsv(rows, [
    "date",
    "type",
    "identifier",
    "operator",
    "provider",
    "amount",
    "commission",
    "status",
    "providerRefId",
  ]);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="transactions.csv"`);
  res.send(csv);
});

const EMPTY_STAT = { count: 0, amount: "0" };

// Aggregates across the caller and their entire downline tree (not just direct children),
// so an Admin/Distributor sees platform-wide totals rather than only their own transactions.
rechargeRouter.get("/stats", async (req, res) => {
  const descendantIds = await getDescendantUserIds(req.user!.userId);
  const userIds = [req.user!.userId, ...descendantIds];

  const grouped = await prisma.transaction.groupBy({
    by: ["status"],
    where: { userId: { in: userIds } },
    _count: { _all: true },
    _sum: { amount: true },
  });

  const stats: Record<string, { count: number; amount: string }> = {
    PENDING: { ...EMPTY_STAT },
    SUCCESS: { ...EMPTY_STAT },
    FAILED: { ...EMPTY_STAT },
    REFUNDED: { ...EMPTY_STAT },
  };
  for (const g of grouped) {
    stats[g.status] = {
      count: g._count._all,
      amount: (g._sum.amount ?? 0).toString(),
    };
  }

  res.json({ stats, scope: userIds.length });
});

rechargeRouter.get("/provider-stats", async (req, res) => {
  const descendantIds = await getDescendantUserIds(req.user!.userId);
  const userIds = [req.user!.userId, ...descendantIds];
  const isAdmin = req.user!.role === "ADMIN";

  const [providers, transactions] = await Promise.all([
    prisma.apiProvider.findMany({
      select: { id: true, name: true, code: true, walletBalance: true, secondaryWalletBalance: true, secondaryWalletLabel: true },
      orderBy: { name: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId: { in: userIds } },
      select: { apiProviderId: true, status: true, amount: true },
    }),
  ]);

  const map = new Map<
    string,
    {
      id: string; name: string; code: string; total: number; success: number; failed: number;
      pendingAmount: number; saleAmount: number;
      walletBalance?: string; secondaryWalletBalance?: string; secondaryWalletLabel?: string;
    }
  >();
  for (const p of providers) {
    map.set(p.id, {
      id: p.id,
      name: p.name,
      code: p.code,
      total: 0,
      success: 0,
      failed: 0,
      pendingAmount: 0,
      saleAmount: 0,
      // Vendor float balances are platform-level financial data — ADMIN only.
      ...(isAdmin
        ? {
            walletBalance: p.walletBalance.toString(),
            secondaryWalletBalance: p.secondaryWalletBalance.toString(),
            secondaryWalletLabel: p.secondaryWalletLabel,
          }
        : {}),
    });
  }
  for (const t of transactions) {
    const entry = map.get(t.apiProviderId);
    if (!entry) continue;
    entry.total++;
    if (t.status === "SUCCESS") {
      entry.success++;
      entry.saleAmount += Number(t.amount);
    }
    if (t.status === "FAILED") entry.failed++;
    if (t.status === "PENDING") entry.pendingAmount += Number(t.amount);
  }

  res.json({ providers: Array.from(map.values()).sort((a, b) => b.total - a.total) });
});

rechargeRouter.get(
  "/operator-stats",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const descendantIds = await getDescendantUserIds(req.user!.userId);
    const userIds = [req.user!.userId, ...descendantIds];

    const transactions = await prisma.transaction.findMany({
      where: { userId: { in: userIds } },
      select: {
        operatorId: true,
        status: true,
        amount: true,
        commission: true,
        operator: { select: { name: true, code: true } },
      },
    });

    const map = new Map<
      string,
      { id: string; name: string; code: string; total: number; success: number; amount: number; commission: number }
    >();
    for (const t of transactions) {
      if (!map.has(t.operatorId)) {
        map.set(t.operatorId, {
          id: t.operatorId,
          name: t.operator.name,
          code: t.operator.code,
          total: 0,
          success: 0,
          amount: 0,
          commission: 0,
        });
      }
      const entry = map.get(t.operatorId)!;
      entry.total++;
      if (t.status === "SUCCESS") {
        entry.success++;
        entry.amount += Number(t.amount);
        entry.commission += Number(t.commission);
      }
    }

    res.json({ operators: Array.from(map.values()).sort((a, b) => b.total - a.total) });
  }
);

rechargeRouter.get(
  "/user-stats",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const descendantIds = await getDescendantUserIds(req.user!.userId);

    const [transactions, fundTransfers, wallets] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: { in: descendantIds } },
        select: {
          userId: true,
          status: true,
          amount: true,
          user: { select: { name: true, phone: true } },
        },
      }),
      prisma.fundTransfer.groupBy({
        by: ["fromUserId"],
        where: { fromUserId: { in: descendantIds } },
        _sum: { amount: true },
      }),
      prisma.wallet.findMany({
        where: { userId: { in: descendantIds } },
        select: { userId: true, balance: true },
      }),
    ]);

    const fundTransferredMap = new Map(fundTransfers.map((f) => [f.fromUserId, Number(f._sum.amount ?? 0)]));
    const balanceMap = new Map(wallets.map((w) => [w.userId, Number(w.balance)]));

    const map = new Map<
      string,
      { id: string; name: string; phone: string; total: number; success: number; amount: number; fundTransferred: number; balance: number }
    >();
    for (const t of transactions) {
      if (!map.has(t.userId)) {
        map.set(t.userId, {
          id: t.userId,
          name: t.user.name,
          phone: t.user.phone,
          total: 0,
          success: 0,
          amount: 0,
          fundTransferred: fundTransferredMap.get(t.userId) ?? 0,
          balance: balanceMap.get(t.userId) ?? 0,
        });
      }
      const entry = map.get(t.userId)!;
      entry.total++;
      if (t.status === "SUCCESS") {
        entry.success++;
        entry.amount += Number(t.amount);
      }
    }

    res.json({ users: Array.from(map.values()).sort((a, b) => b.amount - a.amount) });
  }
);

// Ops tool: view transactions still stuck in PENDING across the caller's downline,
// and let a manager manually mark them SUCCESS/FAILED if the provider never
// called back (mirrors AP Money's "Pendings" report with Action/Response).
rechargeRouter.get(
  "/pending",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const descendantIds = await getDescendantUserIds(req.user!.userId);
    const userIds = [req.user!.userId, ...descendantIds];

    const where: Record<string, unknown> = { userId: { in: userIds }, status: "PENDING" };

    const userIdFilter = req.query.userId;
    if (typeof userIdFilter === "string" && userIdFilter.trim()) {
      where.userId = userIdFilter;
    }
    const apiProviderId = req.query.apiProviderId;
    if (typeof apiProviderId === "string" && apiProviderId.trim()) {
      where.apiProviderId = apiProviderId;
    }
    const operatorId = req.query.operatorId;
    if (typeof operatorId === "string" && operatorId.trim()) {
      where.operatorId = operatorId;
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: { operator: true, apiProvider: true, user: { select: { name: true, phone: true } } },
    });
    res.json({ transactions });
  }
);

function parseRange(query: Record<string, unknown>) {
  const fromRaw = query.from;
  const toRaw = query.to;
  const from =
    typeof fromRaw === "string" && fromRaw.trim() && !isNaN(Date.parse(fromRaw))
      ? new Date(fromRaw)
      : null;
  const to =
    typeof toRaw === "string" && toRaw.trim() && !isNaN(Date.parse(toRaw)) ? new Date(toRaw) : new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

// Search one user's full transaction picture — mirrors AP Money's "Individual Report".
rechargeRouter.get(
  "/individual-report",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (!search) {
      res.json({ user: null, stats: null, transactions: [] });
      return;
    }
    const descendantIds = await getDescendantUserIds(req.user!.userId);
    const scopeIds = [req.user!.userId, ...descendantIds];

    const user = await prisma.user.findFirst({
      where: { id: { in: scopeIds }, OR: [{ phone: { contains: search } }, { name: { contains: search, mode: "insensitive" } }] },
      select: { id: true, name: true, phone: true, role: true, wallet: { select: { balance: true } } },
    });
    if (!user) {
      res.json({ user: null, stats: null, transactions: [] });
      return;
    }

    const { from, to } = parseRange(req.query as Record<string, unknown>);
    const where = { userId: user.id, ...(from ? { createdAt: { gte: from, lte: to } } : { createdAt: { lte: to } }) };

    const [grouped, transactions] = await Promise.all([
      prisma.transaction.groupBy({ by: ["status"], where, _count: { _all: true }, _sum: { amount: true } }),
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { operator: true, apiProvider: true },
      }),
    ]);

    const stats: Record<string, { count: number; amount: string }> = {
      PENDING: { ...EMPTY_STAT },
      SUCCESS: { ...EMPTY_STAT },
      FAILED: { ...EMPTY_STAT },
      REFUNDED: { ...EMPTY_STAT },
    };
    for (const g of grouped) {
      stats[g.status] = { count: g._count._all, amount: (g._sum.amount ?? 0).toString() };
    }

    res.json({ user, stats, transactions });
  }
);

// Refunded transactions across the caller's downline, with totals.
rechargeRouter.get(
  "/refund-report",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const descendantIds = await getDescendantUserIds(req.user!.userId);
    const userIds = [req.user!.userId, ...descendantIds];
    const { from, to } = parseRange(req.query as Record<string, unknown>);

    const transactions = await prisma.transaction.findMany({
      where: { userId: { in: userIds }, status: "REFUNDED", createdAt: { gte: from ?? undefined, lte: to } },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { operator: true, user: { select: { name: true, phone: true } } },
    });

    const totalAmount = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
    res.json({ transactions, count: transactions.length, totalAmount });
  }
);

// Which retailers in the downline transacted in the given window, and which didn't.
rechargeRouter.get(
  "/retailer-activity",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const descendantIds = await getDescendantUserIds(req.user!.userId);
    const { from, to } = parseRange(req.query as Record<string, unknown>);

    const retailers = await prisma.user.findMany({
      where: { id: { in: descendantIds }, role: "RETAILER" },
      select: { id: true, name: true, phone: true },
    });

    const transactions = await prisma.transaction.groupBy({
      by: ["userId"],
      where: {
        userId: { in: retailers.map((r) => r.id) },
        createdAt: { gte: from ?? undefined, lte: to },
      },
      _count: { _all: true },
      _sum: { amount: true },
    });
    const activeMap = new Map(transactions.map((t) => [t.userId, t]));

    const saleDone = retailers
      .filter((r) => activeMap.has(r.id))
      .map((r) => {
        const t = activeMap.get(r.id)!;
        return { ...r, count: t._count._all, amount: (t._sum.amount ?? 0).toString() };
      });
    const saleNotDone = retailers.filter((r) => !activeMap.has(r.id));

    res.json({ saleDone, saleNotDone });
  }
);

// Approximate operating margin: volume charged to customers, minus commission paid out
// to the chain, minus provider rent debited — a directional profit indicator, not a
// full accounting P&L (real provider settlement cost isn't modeled since providers are mocked).
rechargeRouter.get("/profit-report", authorize("ADMIN"), async (req, res) => {
  const { from, to } = parseRange(req.query as Record<string, unknown>);
  const dateFilter = { gte: from ?? undefined, lte: to };

  const [volumeAgg, rentAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { status: "SUCCESS", createdAt: dateFilter },
      _sum: { amount: true, commission: true },
      _count: { _all: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { referenceType: "RENT", type: "DEBIT", createdAt: dateFilter },
      _sum: { amount: true },
    }),
  ]);

  const totalVolume = Number(volumeAgg._sum.amount ?? 0);
  const totalCommissionPaid = Number(volumeAgg._sum.commission ?? 0);
  const totalRentPaid = Number(rentAgg._sum.amount ?? 0);

  res.json({
    successfulCount: volumeAgg._count._all,
    totalVolume,
    totalCommissionPaid,
    totalRentPaid,
    netMargin: totalVolume - totalCommissionPaid - totalRentPaid,
  });
});

const resolveSchema = z.object({
  outcome: z.enum(["SUCCESS", "FAILED"]),
});

rechargeRouter.post(
  "/:id/resolve",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const parsed = resolveSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
    }

    const txn = await prisma.transaction.findUnique({ where: { id: String(req.params.id) } });
    if (!txn) {
      throw new HttpError(404, "Transaction not found");
    }

    const descendantIds = await getDescendantUserIds(req.user!.userId);
    if (txn.userId !== req.user!.userId && !descendantIds.includes(txn.userId)) {
      throw new HttpError(403, "You can only resolve transactions within your own downline");
    }

    const updated = await settleTransaction(txn.id, txn.userId, `Manually resolved ${txn.type.toLowerCase()}`, {
      success: parsed.data.outcome === "SUCCESS",
      providerRefId: null,
      rawResponse: { manuallyResolvedBy: req.user!.userId, outcome: parsed.data.outcome },
    });

    res.json({ transaction: updated });
  }
);
