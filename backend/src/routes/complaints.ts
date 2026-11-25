import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";

export const complaintsRouter = Router();

complaintsRouter.use(authenticate);

const createSchema = z.object({
  subject: z.string().min(3),
  description: z.string().min(5),
  transactionRef: z.string().optional(),
});

complaintsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const complaint = await prisma.complaint.create({
    data: { userId: req.user!.userId, ...parsed.data },
  });
  res.status(201).json({ complaint });
});

complaintsRouter.get("/", async (req, res) => {
  const complaints = await prisma.complaint.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ complaints });
});

complaintsRouter.get(
  "/team",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const status = req.query.status;
    const where: Record<string, unknown> = { user: { parentId: req.user!.userId } };
    if (
      typeof status === "string" &&
      ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)
    ) {
      where.status = status;
    }

    const complaints = await prisma.complaint.findMany({
      where,
      include: { user: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ complaints });
  }
);

const updateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
  adminRemarks: z.string().optional(),
});

complaintsRouter.patch(
  "/:id",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
    }
    const complaint = await prisma.complaint.findUnique({
      where: { id: String(req.params.id) },
      include: { user: true },
    });
    if (!complaint || complaint.user.parentId !== req.user!.userId) {
      throw new HttpError(404, "Complaint not found");
    }

    const updated = await prisma.complaint.update({
      where: { id: complaint.id },
      data: parsed.data,
    });
    res.json({ complaint: updated });
  }
);
