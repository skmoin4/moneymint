import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { logActivity } from "../utils/activityLog";

export const providersRouter = Router();

providersRouter.use(authenticate, authorize("ADMIN"));

providersRouter.get("/", async (_req, res) => {
  const providers = await prisma.apiProvider.findMany({ orderBy: { name: "asc" } });
  res.json({ providers });
});

const createProviderSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).toUpperCase(),
  providerType: z.enum(["RECHARGE", "AEPS", "DMT", "BBPS"]),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
  rentAmount: z.number().min(0).optional(),
  smsAlertOnSuccess: z.boolean().optional(),
  smsAlertOnFailure: z.boolean().optional(),
  retryCount: z.number().int().min(1).max(5).optional(),
  gstPercent: z.number().min(0).max(100).optional(),
});

providersRouter.post("/", async (req, res) => {
  const parsed = createProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const existing = await prisma.apiProvider.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    throw new HttpError(409, "Provider code already exists");
  }
  const provider = await prisma.apiProvider.create({ data: parsed.data });
  res.status(201).json({ provider });
});

const updateProviderSchema = z.object({
  isActive: z.boolean().optional(),
  name: z.string().min(2).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  apiSecret: z.string().min(1).optional(),
  rentAmount: z.number().min(0).optional(),
  smsAlertOnSuccess: z.boolean().optional(),
  smsAlertOnFailure: z.boolean().optional(),
  retryCount: z.number().int().min(1).max(5).optional(),
  gstPercent: z.number().min(0).max(100).optional(),
});

providersRouter.patch("/:id", async (req, res) => {
  const parsed = updateProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const before = await prisma.apiProvider.findUnique({ where: { id: String(req.params.id) } });
  const provider = await prisma.apiProvider
    .update({ where: { id: req.params.id }, data: parsed.data })
    .catch(() => null);
  if (!provider) {
    throw new HttpError(404, "Provider not found");
  }
  if (before && parsed.data.rentAmount !== undefined && Number(before.rentAmount) !== parsed.data.rentAmount) {
    await logActivity(req, "RENT_AMOUNT_UPDATED", {
      userId: req.user!.userId,
      details: `${provider.name}: ₹${before.rentAmount} → ₹${parsed.data.rentAmount}`,
    });
  }
  res.json({ provider });
});

// Deducts a provider's periodic subscription/rent cost from the root admin's
// wallet — mirrors AP Money's "Debit Rent" between the platform and its
// upstream vendors.
providersRouter.post("/:id/debit-rent", async (req, res) => {
  const provider = await prisma.apiProvider.findUnique({ where: { id: String(req.params.id) } });
  if (!provider) {
    throw new HttpError(404, "Provider not found");
  }
  if (Number(provider.rentAmount) <= 0) {
    throw new HttpError(400, "This provider has no rent amount configured");
  }

  const admin = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
  if (admin.parentId !== null) {
    throw new HttpError(403, "Only the root admin's wallet is debited for rent");
  }

  const gstAmount = Number(provider.rentAmount) * (Number(provider.gstPercent) / 100);
  const totalDebit = Math.round((Number(provider.rentAmount) + gstAmount) * 100) / 100;

  const wallet = await prisma.$transaction(async (tx) => {
    const updated = await tx.wallet.update({
      where: { userId: admin.id },
      data: { balance: { decrement: totalDebit } },
    });
    await tx.ledgerEntry.create({
      data: {
        walletId: updated.id,
        type: "DEBIT",
        amount: totalDebit,
        balanceAfter: updated.balance,
        referenceType: "RENT",
        referenceId: provider.id,
        description:
          gstAmount > 0
            ? `Rent debited for ${provider.name} (₹${provider.rentAmount} + ${provider.gstPercent}% GST)`
            : `Rent debited for ${provider.name}`,
      },
    });
    return updated;
  });

  res.json({ balance: wallet.balance });
});

providersRouter.get("/rent-report", async (req, res) => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
  const wallet = await prisma.wallet.findUnique({ where: { userId: admin.id } });
  if (!wallet) {
    throw new HttpError(404, "Wallet not found");
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: { walletId: wallet.id, referenceType: "RENT" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const providerIds = [...new Set(entries.map((e) => e.referenceId).filter((id): id is string => Boolean(id)))];
  const providers = await prisma.apiProvider.findMany({ where: { id: { in: providerIds } } });
  const providerMap = new Map(providers.map((p) => [p.id, p]));

  // Optional providerType filter (e.g. AEPS/DMT only) — same unified rent ledger,
  // just scoped, instead of maintaining a separate parallel "SMDA" report.
  const typeFilter = req.query.providerType;
  const filteredEntries =
    typeof typeFilter === "string" && typeFilter.trim()
      ? entries.filter((e) => e.referenceId && providerMap.get(e.referenceId)?.providerType === typeFilter)
      : entries;

  res.json({
    entries: filteredEntries.map((e) => ({
      ...e,
      provider: e.referenceId ? providerMap.get(e.referenceId) : null,
    })),
  });
});

const topupSchema = z.object({
  walletSlot: z.union([z.literal(1), z.literal(2)]),
  amount: z.number().positive(),
  description: z.string().optional(),
});

// Admin sends real money to a vendor (bank transfer, etc.) and records it here —
// debits the root admin's own wallet, credits the provider's float.
providersRouter.post("/:id/topup-wallet", async (req, res) => {
  const parsed = topupSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const provider = await prisma.apiProvider.findUnique({ where: { id: String(req.params.id) } });
  if (!provider) {
    throw new HttpError(404, "Provider not found");
  }
  const admin = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
  if (admin.parentId !== null) {
    throw new HttpError(403, "Only the root admin can fund provider wallets");
  }

  const { walletSlot, amount, description } = parsed.data;
  const balanceField = walletSlot === 1 ? "walletBalance" : "secondaryWalletBalance";

  const result = await prisma.$transaction(async (tx) => {
    const adminWallet = await tx.wallet.update({
      where: { userId: admin.id },
      data: { balance: { decrement: amount } },
    });
    if (adminWallet.balance.lessThan(0)) {
      throw new HttpError(400, "Insufficient balance");
    }
    await tx.ledgerEntry.create({
      data: {
        walletId: adminWallet.id,
        type: "DEBIT",
        amount,
        balanceAfter: adminWallet.balance,
        referenceType: "ADJUSTMENT",
        referenceId: provider.id,
        description: `Funded ${provider.name} ${walletSlot === 1 ? "Wallet 1" : provider.secondaryWalletLabel}${description ? `: ${description}` : ""}`,
      },
    });

    const updatedProvider = await tx.apiProvider.update({
      where: { id: provider.id },
      data: { [balanceField]: { increment: amount } },
    });
    await tx.providerWalletEntry.create({
      data: {
        apiProviderId: provider.id,
        walletSlot,
        type: "CREDIT",
        amount,
        balanceAfter: walletSlot === 1 ? updatedProvider.walletBalance : updatedProvider.secondaryWalletBalance,
        description: description || "Manual top-up",
      },
    });
    return updatedProvider;
  });

  res.json({ provider: result });
});

providersRouter.get("/:id/wallet-report", async (req, res) => {
  const entries = await prisma.providerWalletEntry.findMany({
    where: { apiProviderId: String(req.params.id) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ entries });
});

// Audit trail of rentAmount edits — mirrors AP Money's "Report Rent Update".
providersRouter.get("/rent-update-report", async (_req, res) => {
  const logs = await prisma.activityLog.findMany({
    where: { action: "RENT_AMOUNT_UPDATED" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const userIds = [...new Set(logs.map((l) => l.userId).filter((id): id is string => Boolean(id)))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, phone: true } });
  const userMap = new Map(users.map((u) => [u.id, u]));
  res.json({
    logs: logs.map((l) => ({ ...l, user: l.userId ? (userMap.get(l.userId) ?? null) : null })),
  });
});
