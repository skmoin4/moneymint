import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { sendSms } from "../services/smsService";

export const balanceRequestsRouter = Router();

balanceRequestsRouter.use(authenticate);

const createSchema = z.object({
  amount: z.number().positive().max(10_000_000),
  utrNumber: z.string().trim().min(4).max(40),
  bankAccountId: z.string().uuid().optional(),
  paymentMode: z.string().max(30).optional(),
  depositedAt: z.string().optional(),
});

/** A UTR can back only one request that is pending or approved — prevents double credit. */
async function assertUtrUnused(utrNumber: string, exceptId?: string) {
  const clash = await prisma.balanceRequest.findFirst({
    where: {
      utrNumber: { equals: utrNumber, mode: "insensitive" },
      status: { in: ["PENDING", "APPROVED"] },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { status: true },
  });
  if (clash) throw new HttpError(409, `This UTR is already used in a ${clash.status.toLowerCase()} request`);
}

// A user (Distributor/Retailer/etc.) deposits cash into their parent's bank
// account and files a claim here; the parent verifies the UTR and approves.
balanceRequestsRouter.post("/", async (req, res) => {
  const requester = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
  if (!requester.parentId) {
    throw new HttpError(400, "The root admin should use Add Balance instead of a balance request");
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }

  const { amount, utrNumber, bankAccountId, paymentMode, depositedAt } = parsed.data;
  await assertUtrUnused(utrNumber);
  if (bankAccountId) {
    // Must be one of the accounts this user is shown: their parent's own accounts, or
    // the company's when the parent is the root admin.
    const parent = await prisma.user.findUniqueOrThrow({ where: { id: requester.parentId }, select: { id: true, parentId: true } });
    const account = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, isActive: true, OR: [{ ownerId: parent.id }, ...(parent.parentId === null ? [{ ownerId: null }] : [])] },
    });
    if (!account) throw new HttpError(400, "Choose one of the listed bank accounts");
  }

  const request = await prisma.balanceRequest.create({
    data: {
      userId: req.user!.userId,
      amount,
      utrNumber,
      bankAccountId,
      paymentMode,
      depositedAt: depositedAt && !isNaN(Date.parse(depositedAt)) ? new Date(depositedAt) : undefined,
    },
  });
  res.status(201).json({ request });
});

balanceRequestsRouter.get("/", async (req, res) => {
  const requests = await prisma.balanceRequest.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ requests });
});

balanceRequestsRouter.get(
  "/team",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const status = req.query.status;
    const where: Record<string, unknown> = { user: { parentId: req.user!.userId } };
    if (typeof status === "string" && ["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      where.status = status;
    }
    const requests = await prisma.balanceRequest.findMany({
      where,
      include: { user: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ requests });
  }
);

const reviewSchema = z.object({
  remarks: z.string().optional(),
});

balanceRequestsRouter.post(
  "/:id/approve",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
    }
    const request = await prisma.balanceRequest.findUnique({
      where: { id: String(req.params.id) },
      include: { user: true },
    });
    if (!request || request.user.parentId !== req.user!.userId) {
      throw new HttpError(404, "Balance request not found");
    }
    if (request.status !== "PENDING") {
      throw new HttpError(409, `Request is already ${request.status.toLowerCase()}`);
    }

    await assertUtrUnused(request.utrNumber, request.id);
    const approver = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId }, select: { id: true, name: true, parentId: true } });

    const updated = await prisma.$transaction(async (tx) => {
      // Atomic claim so a double-click can't approve (and credit) twice.
      const claimed = await tx.balanceRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: "APPROVED", remarks: parsed.data.remarks, reviewedById: approver.id, reviewedAt: new Date() },
      });
      if (claimed.count === 0) throw new HttpError(409, "Request was already reviewed");

      // The deposit landed in the approver's own bank account, so the approver hands over
      // that much of their wallet balance — exactly like a fund transfer. Only the root
      // admin's approval brings new money into the system (it landed in the company bank).
      if (approver.parentId !== null) {
        const from = await tx.wallet.update({ where: { userId: approver.id }, data: { balance: { decrement: request.amount } } });
        if (from.balance.lessThan(0)) {
          throw new HttpError(400, `Insufficient balance: you need ₹${request.amount} in your wallet to approve this request`);
        }
        await tx.ledgerEntry.create({
          data: {
            walletId: from.id,
            type: "DEBIT",
            amount: request.amount,
            balanceAfter: from.balance,
            referenceType: "BALANCE_REQUEST",
            referenceId: request.id,
            description: `Balance request of ${request.user.name} approved (UTR: ${request.utrNumber})`,
          },
        });
      }

      const wallet = await tx.wallet.update({
        where: { userId: request.userId },
        data: { balance: { increment: request.amount } },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: "CREDIT",
          amount: request.amount,
          balanceAfter: wallet.balance,
          referenceType: "BALANCE_REQUEST",
          referenceId: request.id,
          description: `Balance request approved by ${approver.name} (UTR: ${request.utrNumber})`,
        },
      });
      return tx.balanceRequest.findUniqueOrThrow({ where: { id: request.id } });
    });

    await sendSms(
      request.user.phone,
      `Your balance request of Rs.${request.amount} (UTR: ${request.utrNumber}) has been approved.`,
      "BALANCE_REQUEST"
    );

    res.json({ request: updated });
  }
);

balanceRequestsRouter.post(
  "/:id/reject",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
    }
    const request = await prisma.balanceRequest.findUnique({
      where: { id: String(req.params.id) },
      include: { user: true },
    });
    if (!request || request.user.parentId !== req.user!.userId) {
      throw new HttpError(404, "Balance request not found");
    }
    if (request.status !== "PENDING") {
      throw new HttpError(409, `Request is already ${request.status.toLowerCase()}`);
    }

    const updated = await prisma.balanceRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", remarks: parsed.data.remarks, reviewedById: req.user!.userId, reviewedAt: new Date() },
    });
    res.json({ request: updated });
  }
);

// Reconciliation view: which approved balance requests have been confirmed as actually
// landed in the bank (via UPI QR) — mirrors AP Money's "UPI QR Settlement".
balanceRequestsRouter.get(
  "/qr-settlement",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const requests = await prisma.balanceRequest.findMany({
      where: { user: { parentId: req.user!.userId }, status: "APPROVED" },
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    res.json({ requests });
  }
);

balanceRequestsRouter.post(
  "/:id/qr-settle",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const request = await prisma.balanceRequest.findUnique({
      where: { id: String(req.params.id) },
      include: { user: true },
    });
    if (!request || request.user.parentId !== req.user!.userId) {
      throw new HttpError(404, "Balance request not found");
    }
    const updated = await prisma.balanceRequest.update({
      where: { id: request.id },
      data: { qrSettled: !request.qrSettled },
    });
    res.json({ request: updated });
  }
);
