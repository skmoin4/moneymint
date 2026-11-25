import { Router } from "express";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import type { Prisma } from "../generated/prisma/client";

// "Main Payment Summary": every way money entered user wallets — Gateway checkout,
// Static QR, and Bank & Direct (approved balance requests) — with totals.
export const adminPaymentsRouter = Router();

adminPaymentsRouter.use(authenticate, authorize("ADMIN"));

function range(q: Record<string, unknown>) {
  const from = typeof q.from === "string" && !isNaN(Date.parse(q.from)) ? new Date(q.from) : undefined;
  let to: Date | undefined;
  if (typeof q.to === "string" && !isNaN(Date.parse(q.to))) {
    to = new Date(q.to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.to)) to.setHours(23, 59, 59, 999);
  }
  return from || to ? { gte: from, lte: to } : undefined;
}

function userFilter(q: Record<string, unknown>) {
  const u = typeof q.user === "string" ? q.user.trim() : "";
  return u ? { user: { OR: [{ phone: { contains: u } }, { name: { contains: u, mode: "insensitive" as const } }] } } : {};
}

adminPaymentsRouter.get("/", async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const channel = q.channel === "QR" ? "QR" : q.channel === "BANK" ? "BANK" : "GATEWAY";
  const createdAt = range(q);

  if (channel === "BANK") {
    const status = typeof q.status === "string" && ["PENDING", "APPROVED", "REJECTED"].includes(q.status) ? q.status : "APPROVED";
    const where: Prisma.BalanceRequestWhereInput = {
      status: status as "PENDING" | "APPROVED" | "REJECTED",
      ...(createdAt ? { createdAt } : {}),
      ...userFilter(q),
    };
    const [rows, agg] = await Promise.all([
      prisma.balanceRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 500,
        include: { user: { select: { name: true, phone: true, parent: { select: { name: true } } } } },
      }),
      prisma.balanceRequest.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    const accountIds = [...new Set(rows.map((r) => r.bankAccountId).filter((v): v is string => Boolean(v)))];
    const accounts = await prisma.bankAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, bankName: true, accountNumber: true } });
    const accountMap = new Map(accounts.map((a) => [a.id, `${a.bankName} ••${a.accountNumber.slice(-4)}`]));
    res.json({
      channel,
      rows: rows.map((r) => ({ ...r, bankAccount: r.bankAccountId ? accountMap.get(r.bankAccountId) ?? null : null })),
      summary: { count: agg._count._all, amount: Number(agg._sum.amount ?? 0), charges: 0, net: Number(agg._sum.amount ?? 0) },
    });
    return;
  }

  const status = typeof q.status === "string" && ["PENDING", "PAID", "FAILED"].includes(q.status) ? q.status : undefined;
  const where: Prisma.PaymentOrderWhereInput = {
    channel,
    ...(status ? { status } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...userFilter(q),
  };
  const [rows, paidAgg, byMethod, byStatus] = await Promise.all([
    prisma.paymentOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { user: { select: { name: true, phone: true } } },
    }),
    prisma.paymentOrder.aggregate({ where: { ...where, status: "PAID" }, _sum: { amount: true, charges: true, netAmount: true }, _count: { _all: true } }),
    prisma.paymentOrder.groupBy({ by: ["method"], where: { ...where, status: "PAID" }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.paymentOrder.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);
  res.json({
    channel,
    rows,
    summary: {
      count: paidAgg._count._all,
      amount: Number(paidAgg._sum.amount ?? 0),
      charges: Number(paidAgg._sum.charges ?? 0),
      net: Number(paidAgg._sum.netAmount ?? 0),
      byMethod: byMethod.map((m) => ({ method: m.method ?? "unknown", count: m._count._all, amount: Number(m._sum.amount ?? 0) })),
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    },
  });
});
