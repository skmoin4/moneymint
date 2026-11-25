import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";

export const kycRouter = Router();

kycRouter.use(authenticate);

kycRouter.get("/me", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { kycStatus: true },
  });
  const latest = await prisma.kycRequest.findFirst({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ kycStatus: user?.kycStatus, latest });
});

const submitSchema = z.object({
  aadhaarNumber: z.string().regex(/^\d{12}$/, "Aadhaar number must be 12 digits"),
  panNumber: z
    .string()
    .regex(/^[A-Z]{5}\d{4}[A-Z]$/, "PAN must be in the format ABCDE1234F"),
});

kycRouter.post("/", async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
  if (user.kycStatus === "PENDING" || user.kycStatus === "APPROVED") {
    throw new HttpError(409, `KYC is already ${user.kycStatus.toLowerCase()}`);
  }

  const [request] = await prisma.$transaction([
    prisma.kycRequest.create({
      data: {
        userId: user.id,
        aadhaarNumber: parsed.data.aadhaarNumber,
        panNumber: parsed.data.panNumber.toUpperCase(),
        status: "PENDING",
      },
    }),
    prisma.user.update({ where: { id: user.id }, data: { kycStatus: "PENDING" } }),
  ]);

  res.status(201).json({ request });
});

kycRouter.get(
  "/requests",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const status = req.query.status;
    const where: Record<string, unknown> = {
      user: { parentId: req.user!.userId },
    };
    if (typeof status === "string" && ["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      where.status = status;
    }

    const requests = await prisma.kycRequest.findMany({
      where,
      include: { user: { select: { id: true, name: true, phone: true, role: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ requests });
  }
);

const reviewSchema = z.object({
  remarks: z.string().optional(),
});

kycRouter.post(
  "/requests/:id/approve",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
    }
    const request = await prisma.kycRequest.findUnique({
      where: { id: String(req.params.id) },
      include: { user: true },
    });
    if (!request || request.user.parentId !== req.user!.userId) {
      throw new HttpError(404, "KYC request not found");
    }

    const [updated] = await prisma.$transaction([
      prisma.kycRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", remarks: parsed.data.remarks, reviewedById: req.user!.userId },
      }),
      prisma.user.update({ where: { id: request.userId }, data: { kycStatus: "APPROVED" } }),
    ]);

    res.json({ request: updated });
  }
);

kycRouter.post(
  "/requests/:id/reject",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
    }
    const request = await prisma.kycRequest.findUnique({
      where: { id: String(req.params.id) },
      include: { user: true },
    });
    if (!request || request.user.parentId !== req.user!.userId) {
      throw new HttpError(404, "KYC request not found");
    }

    const [updated] = await prisma.$transaction([
      prisma.kycRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", remarks: parsed.data.remarks, reviewedById: req.user!.userId },
      }),
      prisma.user.update({ where: { id: request.userId }, data: { kycStatus: "REJECTED" } }),
    ]);

    res.json({ request: updated });
  }
);
