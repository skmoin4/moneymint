import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";

export const cashbackRouter = Router();

cashbackRouter.use(authenticate, authorize("ADMIN"));

cashbackRouter.get("/", async (_req, res) => {
  const offers = await prisma.cashbackOffer.findMany({
    include: { operator: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ offers });
});

const upsertOfferSchema = z.object({
  name: z.string().min(2),
  operatorId: z.string().uuid().optional(),
  minAmount: z.number().min(0).optional(),
  percent: z.number().min(0).max(100),
  maxCashback: z.number().positive().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
});

cashbackRouter.post("/", async (req, res) => {
  const parsed = upsertOfferSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const { validFrom, validTo, ...rest } = parsed.data;
  const offer = await prisma.cashbackOffer.create({
    data: {
      ...rest,
      validFrom: validFrom ? new Date(validFrom) : undefined,
      validTo: validTo ? new Date(validTo) : undefined,
    },
    include: { operator: true },
  });
  res.status(201).json({ offer });
});

const updateOfferSchema = z.object({ isActive: z.boolean().optional() });

cashbackRouter.patch("/:id", async (req, res) => {
  const parsed = updateOfferSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const offer = await prisma.cashbackOffer
    .update({ where: { id: String(req.params.id) }, data: parsed.data, include: { operator: true } })
    .catch(() => null);
  if (!offer) {
    throw new HttpError(404, "Cashback offer not found");
  }
  res.json({ offer });
});

cashbackRouter.delete("/:id", async (req, res) => {
  await prisma.cashbackOffer.delete({ where: { id: String(req.params.id) } }).catch(() => null);
  res.status(204).send();
});
