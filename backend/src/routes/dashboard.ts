import { Router } from "express";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { getDescendantUserIds } from "../utils/hierarchy";

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

// Cross-cutting "needs attention" counts for the dashboard's pending-actions widget.
dashboardRouter.get(
  "/pending-summary",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const descendantIds = await getDescendantUserIds(req.user!.userId);
    const userIds = [req.user!.userId, ...descendantIds];

    const [pendingKyc, openComplaints, pendingBalanceRequests, totalUsers, pendingGatewayOrders, pendingTransactions] =
      await Promise.all([
        prisma.kycRequest.count({ where: { userId: { in: userIds }, status: "PENDING" } }),
        prisma.complaint.count({ where: { userId: { in: userIds }, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
        prisma.balanceRequest.count({ where: { user: { parentId: req.user!.userId }, status: "PENDING" } }),
        prisma.user.count({ where: { id: { in: descendantIds } } }),
        // "Balance Requests Gateway" — online top-ups started but not yet confirmed by the gateway.
        prisma.paymentOrder.count({ where: { userId: { in: userIds }, status: "PENDING" } }),
        prisma.transaction.count({ where: { userId: { in: userIds }, status: "PENDING" } }),
      ]);

    res.json({
      pendingKyc,
      openComplaints,
      pendingBalanceRequests,
      totalUsers,
      pendingGatewayOrders,
      pendingTransactions,
    });
  }
);

// Deeper platform financial breakdown — mirrors AP Money's dashboard "load more" block
// (Generated Commission Main, Outlet Balances by role, Total Recharges Yesterday, etc).
// Every figure here is computed from real ledger/wallet data; nothing is fabricated.
dashboardRouter.get("/extended-summary", authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"), async (req, res) => {
  const descendantIds = await getDescendantUserIds(req.user!.userId);
  const userIds = [req.user!.userId, ...descendantIds];

  const startOfYesterday = new Date();
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  startOfYesterday.setHours(0, 0, 0, 0);
  const endOfYesterday = new Date(startOfYesterday);
  endOfYesterday.setHours(23, 59, 59, 999);

  const [
    totalUsers,
    commissionAgg,
    transferAgg,
    refundAgg,
    callerWallet,
    usersByRole,
    yesterdayAgg,
    surchargeAgg,
    apiOutletAgg,
  ] = await Promise.all([
    prisma.user.count({ where: { id: { in: descendantIds } } }),
    prisma.ledgerEntry.aggregate({
      where: { referenceType: "COMMISSION", wallet: { userId: { in: userIds } } },
      _sum: { amount: true },
    }),
    prisma.fundTransfer.aggregate({
      where: { fromUserId: { in: userIds } },
      _sum: { amount: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { referenceType: "REFUND", wallet: { userId: { in: userIds } } },
      _sum: { amount: true },
    }),
    prisma.wallet.findUnique({ where: { userId: req.user!.userId } }),
    prisma.user.findMany({
      where: { id: { in: descendantIds } },
      select: { role: true, wallet: { select: { balance: true } } },
    }),
    prisma.transaction.aggregate({
      where: {
        userId: { in: userIds },
        status: "SUCCESS",
        createdAt: { gte: startOfYesterday, lte: endOfYesterday },
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId: { in: userIds }, status: "SUCCESS" },
      _sum: { surcharge: true },
    }),
    // "API Outlet Main": wallet balance held by API users in the downline.
    prisma.wallet.aggregate({
      where: { userId: { in: descendantIds }, user: { apiCredential: { isActive: true } } },
      _sum: { balance: true },
    }),
  ]);

  const outletTotals = { MASTER_DISTRIBUTOR: 0, DISTRIBUTOR: 0, RETAILER: 0 };
  for (const u of usersByRole) {
    const bal = Number(u.wallet?.balance ?? 0);
    if (u.role in outletTotals) {
      outletTotals[u.role as keyof typeof outletTotals] += bal;
    }
  }
  const totalOutletBalance = outletTotals.MASTER_DISTRIBUTOR + outletTotals.DISTRIBUTOR + outletTotals.RETAILER;

  res.json({
    totalUsers,
    generatedCommission: Number(commissionAgg._sum.amount ?? 0),
    generatedSurcharge: Number(surchargeAgg._sum.surcharge ?? 0),
    apiOutlet: Number(apiOutletAgg._sum.balance ?? 0),
    transferredBalance: Number(transferAgg._sum.amount ?? 0),
    reversedBalance: Number(refundAgg._sum.amount ?? 0),
    adminMainBalance: Number(callerWallet?.balance ?? 0),
    masterDistributorOutlet: outletTotals.MASTER_DISTRIBUTOR,
    distributorOutlet: outletTotals.DISTRIBUTOR,
    retailerOutlet: outletTotals.RETAILER,
    totalOutletBalance,
    recharchesYesterday: { count: yesterdayAgg._count._all, amount: Number(yesterdayAgg._sum.amount ?? 0) },
  });
});
