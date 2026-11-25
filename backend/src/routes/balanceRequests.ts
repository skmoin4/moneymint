import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { sendSms } from "../services/smsService";

export const balanceRequestsRouter = Router();

balanceRequestsRouter.use(authenticate);

const createSchema = z.object({
  amount: z.number().positive(),
  utrNumber: z.string().min(4),
});

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

  const request = await prisma.balanceRequest.create({
    data: { userId: req.user!.userId, ...parsed.data },
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

    const updated = await prisma.$transaction(async (tx) => {
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
          referenceType: "ADJUSTMENT",
          referenceId: request.id,
          description: `Balance request approved (UTR: ${request.utrNumber})`,
        },
      });
      return tx.balanceRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", remarks: parsed.data.remarks },
      });
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
      data: { status: "REJECTED", remarks: parsed.data.remarks },
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
