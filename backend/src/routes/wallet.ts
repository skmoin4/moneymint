import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { toCsv } from "../utils/csv";
import { logActivity } from "../utils/activityLog";
import { getDescendantUserIds } from "../utils/hierarchy";
import { requirePinIfEnabled } from "../middleware/requirePin";

export const walletRouter = Router();

walletRouter.use(authenticate);

const transferSchema = z.object({
  toUserId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMode: z.string().min(2),
  utrNumber: z.string().optional(),
  autoCommission: z.boolean().optional(),
});

const DEFAULT_TRANSFER_COMMISSION_PERCENT = 0.5;

walletRouter.post(
  "/transfer",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  requirePinIfEnabled,
  async (req, res) => {
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
    }
    const { toUserId, amount, paymentMode, utrNumber, autoCommission } = parsed.data;
    const fromUserId = req.user!.userId;

    if (toUserId === fromUserId) {
      throw new HttpError(400, "Cannot transfer to yourself");
    }

    let commission = 0;
    if (autoCommission) {
      const setting = await prisma.systemSetting.findUnique({ where: { key: "transferCommissionPercent" } });
      const rate = setting ? Number(setting.value) : DEFAULT_TRANSFER_COMMISSION_PERCENT;
      commission = Math.round(amount * (rate / 100) * 100) / 100;
    }
    const amountToRecipient = amount - commission;

    const transfer = await prisma.$transaction(async (tx) => {
      const toUser = await tx.user.findUnique({ where: { id: toUserId } });
      if (!toUser) {
        throw new HttpError(404, "Recipient not found");
      }
      if (toUser.parentId !== fromUserId) {
        throw new HttpError(403, "You can only transfer funds to your direct downline");
      }

      const fundTransfer = await tx.fundTransfer.create({
        data: {
          fromUserId,
          toUserId,
          amount,
          paymentMode,
          utrNumber,
          status: "APPROVED",
        },
      });

      const fromWallet = await tx.wallet.update({
        where: { userId: fromUserId },
        data: { balance: { decrement: amount } },
      });
      if (fromWallet.balance.lessThan(0)) {
        throw new HttpError(400, "Insufficient balance");
      }
      await tx.ledgerEntry.create({
        data: {
          walletId: fromWallet.id,
          type: "DEBIT",
          amount,
          balanceAfter: fromWallet.balance,
          referenceType: "FUND_TRANSFER",
          referenceId: fundTransfer.id,
          description: `Transfer to ${toUser.name}`,
        },
      });

      const toWallet = await tx.wallet.update({
        where: { userId: toUserId },
        data: { balance: { increment: amountToRecipient } },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: toWallet.id,
          type: "CREDIT",
          amount: amountToRecipient,
          balanceAfter: toWallet.balance,
          referenceType: "FUND_TRANSFER",
          referenceId: fundTransfer.id,
          description:
            commission > 0
              ? `Received from ${req.user!.userId} (₹${commission} handling commission retained by sender)`
              : `Received from ${req.user!.userId}`,
        },
      });

      if (commission > 0) {
        const senderWalletAfterCommission = await tx.wallet.update({
          where: { userId: fromUserId },
          data: { balance: { increment: commission } },
        });
        await tx.ledgerEntry.create({
          data: {
            walletId: senderWalletAfterCommission.id,
            type: "CREDIT",
            amount: commission,
            balanceAfter: senderWalletAfterCommission.balance,
            referenceType: "COMMISSION",
            referenceId: fundTransfer.id,
            description: `Handling commission for transfer to ${toUser.name}`,
          },
        });
      }

      return fundTransfer;
    });

    await logActivity(req, "FUND_TRANSFER", {
      userId: req.user!.userId,
      details: `Transferred ₹${amount} to ${toUserId}${commission > 0 ? ` (₹${commission} auto commission)` : ""}`,
    });

    res.status(201).json({ transfer, commission });
  }
);

const selfFundSchema = z.object({
  amount: z.number().positive(),
  paymentInfo: z.string().min(2),
  reference: z.string().optional(),
});

// Only the root Admin (no parent) can self-fund — everyone else receives
// balance via /wallet/transfer from their parent in the hierarchy.
walletRouter.post("/self-fund", authorize("ADMIN"), async (req, res) => {
  const requester = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
  if (requester.parentId !== null) {
    throw new HttpError(403, "Only the root admin account can self-fund");
  }

  const parsed = selfFundSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const { amount, paymentInfo, reference } = parsed.data;

  const wallet = await prisma.$transaction(async (tx) => {
    const updated = await tx.wallet.update({
      where: { userId: req.user!.userId },
      data: { balance: { increment: amount } },
    });
    await tx.ledgerEntry.create({
      data: {
        walletId: updated.id,
        type: "CREDIT",
        amount,
        balanceAfter: updated.balance,
        referenceType: "ADJUSTMENT",
        referenceId: reference,
        description: `Capital added: ${paymentInfo}`,
      },
    });
    return updated;
  });

  res.status(201).json({ balance: wallet.balance });
});

walletRouter.get("/balance", async (req, res) => {
  const wallet = await prisma.wallet.findUnique({
    where: { userId: req.user!.userId },
  });
  if (!wallet) {
    throw new HttpError(404, "Wallet not found");
  }
  res.json({ balance: wallet.balance });
});

// "Your Cashback" screen — total earned + recent history, for the logged-in user's own wallet.
walletRouter.get("/cashback-summary", async (req, res) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.userId } });
  if (!wallet) {
    throw new HttpError(404, "Wallet not found");
  }
  const [entries, agg] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { walletId: wallet.id, referenceType: "CASHBACK" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.ledgerEntry.aggregate({
      where: { walletId: wallet.id, referenceType: "CASHBACK" },
      _sum: { amount: true },
    }),
  ]);
  res.json({ totalCashback: agg._sum.amount ?? 0, entries });
});

walletRouter.get("/opening-closing", async (req, res) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.userId } });
  if (!wallet) {
    throw new HttpError(404, "Wallet not found");
  }

  const fromRaw = req.query.from;
  const toRaw = req.query.to;
  const from =
    typeof fromRaw === "string" && fromRaw.trim() && !isNaN(Date.parse(fromRaw))
      ? new Date(fromRaw)
      : null;
  const to =
    typeof toRaw === "string" && toRaw.trim() && !isNaN(Date.parse(toRaw)) ? new Date(toRaw) : new Date();
  to.setHours(23, 59, 59, 999);

  const openingEntry = from
    ? await prisma.ledgerEntry.findFirst({
        where: { walletId: wallet.id, createdAt: { lt: from } },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const closingEntry = await prisma.ledgerEntry.findFirst({
    where: { walletId: wallet.id, createdAt: { lte: to } },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    opening: openingEntry?.balanceAfter ?? 0,
    closing: closingEntry?.balanceAfter ?? wallet.balance,
    currentBalance: wallet.balance,
  });
});

// Opening/closing balance for every user in the caller's downline, for a date range —
// mirrors AP Money's "Opening Closing Report Main".
walletRouter.get(
  "/opening-closing-report",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const descendantIds = await getDescendantUserIds(req.user!.userId);
    const userIds = [req.user!.userId, ...descendantIds];

    const fromRaw = req.query.from;
    const toRaw = req.query.to;
    const from =
      typeof fromRaw === "string" && fromRaw.trim() && !isNaN(Date.parse(fromRaw))
        ? new Date(fromRaw)
        : null;
    const to =
      typeof toRaw === "string" && toRaw.trim() && !isNaN(Date.parse(toRaw)) ? new Date(toRaw) : new Date();
    to.setHours(23, 59, 59, 999);

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, phone: true, role: true, wallet: { select: { id: true, balance: true } } },
    });

    const rows = await Promise.all(
      users
        .filter((u) => u.wallet)
        .map(async (u) => {
          const wallet = u.wallet!;
          const [openingEntry, closingEntry] = await Promise.all([
            from
              ? prisma.ledgerEntry.findFirst({
                  where: { walletId: wallet.id, createdAt: { lt: from } },
                  orderBy: { createdAt: "desc" },
                })
              : null,
            prisma.ledgerEntry.findFirst({
              where: { walletId: wallet.id, createdAt: { lte: to } },
              orderBy: { createdAt: "desc" },
            }),
          ]);
          return {
            id: u.id,
            name: u.name,
            phone: u.phone,
            role: u.role,
            opening: openingEntry?.balanceAfter.toString() ?? "0",
            closing: closingEntry?.balanceAfter.toString() ?? wallet.balance.toString(),
          };
        })
    );

    res.json({ rows });
  }
);

// Downline fund-transfer activity in a date range — mirrors AP Money's "Last 3 days Secondary Report".
walletRouter.get(
  "/secondary-sales-report",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const descendantIds = await getDescendantUserIds(req.user!.userId);
    const userIds = [req.user!.userId, ...descendantIds];

    const fromRaw = req.query.from;
    const toRaw = req.query.to;
    const from =
      typeof fromRaw === "string" && fromRaw.trim() && !isNaN(Date.parse(fromRaw))
        ? new Date(fromRaw)
        : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const to =
      typeof toRaw === "string" && toRaw.trim() && !isNaN(Date.parse(toRaw)) ? new Date(toRaw) : new Date();
    to.setHours(23, 59, 59, 999);

    const userFilter = req.query.userId;
    const where: Record<string, unknown> =
      typeof userFilter === "string" && userFilter.trim()
        ? {
            AND: [
              { fromUserId: { in: userIds } },
              { OR: [{ fromUserId: userFilter }, { toUserId: userFilter }] },
            ],
            createdAt: { gte: from, lte: to },
          }
        : { fromUserId: { in: userIds }, createdAt: { gte: from, lte: to } };

    const transfers = await prisma.fundTransfer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        fromUser: { select: { name: true, phone: true } },
        toUser: { select: { name: true, phone: true } },
      },
    });

    const totalAmount = transfers.reduce((sum, t) => sum + Number(t.amount), 0);
    res.json({ transfers, totalAmount });
  }
);

walletRouter.get(
  "/secondary-sales-report/export",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const descendantIds = await getDescendantUserIds(req.user!.userId);
    const userIds = [req.user!.userId, ...descendantIds];
    const transfers = await prisma.fundTransfer.findMany({
      where: { fromUserId: { in: userIds } },
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: { fromUser: { select: { name: true, phone: true } }, toUser: { select: { name: true, phone: true } } },
    });
    const rows = transfers.map((t) => ({
      date: t.createdAt.toISOString(),
      from: t.fromUser.name,
      to: t.toUser.name,
      amount: t.amount.toString(),
      paymentMode: t.paymentMode,
      utrNumber: t.utrNumber ?? "",
    }));
    const csv = toCsv(rows, ["date", "from", "to", "amount", "paymentMode", "utrNumber"]);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="secondary-sales.csv"`);
    res.send(csv);
  }
);

const LEDGER_TYPE_VALUES = ["CREDIT", "DEBIT"];
const REFERENCE_TYPE_VALUES = [
  "RECHARGE",
  "BBPS",
  "DMT",
  "AEPS",
  "FUND_TRANSFER",
  "COMMISSION",
  "REFUND",
  "ADJUSTMENT",
  "RENT",
  "CASHBACK",
  "REFERRAL_REWARD",
  "WALLET_TOPUP",
];

async function buildLedgerFilter(userId: string, query: Record<string, unknown>) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    throw new HttpError(404, "Wallet not found");
  }

  const where: Record<string, unknown> = { walletId: wallet.id };

  const type = query.type;
  if (typeof type === "string" && LEDGER_TYPE_VALUES.includes(type)) {
    where.type = type;
  }

  const referenceType = query.referenceType;
  if (typeof referenceType === "string" && REFERENCE_TYPE_VALUES.includes(referenceType)) {
    where.referenceType = referenceType;
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

walletRouter.get("/ledger", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const where = await buildLedgerFilter(req.user!.userId, req.query as Record<string, unknown>);

  const [entries, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ledgerEntry.count({ where }),
  ]);

  res.json({ entries, total, page, pageSize });
});

walletRouter.get("/ledger/export", async (req, res) => {
  const where = await buildLedgerFilter(req.user!.userId, req.query as Record<string, unknown>);
  const entries = await prisma.ledgerEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const rows = entries.map((e) => ({
    date: e.createdAt.toISOString(),
    type: e.type,
    referenceType: e.referenceType,
    description: e.description ?? "",
    amount: e.amount.toString(),
    balanceAfter: e.balanceAfter.toString(),
  }));

  const csv = toCsv(rows, ["date", "type", "referenceType", "description", "amount", "balanceAfter"]);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="ledger.csv"`);
  res.send(csv);
});
