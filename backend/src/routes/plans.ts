import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";

export const plansRouter = Router();

plansRouter.use(authenticate);

// "Explore Plans" — the app fetches this to let a user browse plans instead of typing
// an arbitrary amount blind.
plansRouter.get("/", async (req, res) => {
  const operatorCode = req.query.operatorCode;
  if (typeof operatorCode !== "string" || !operatorCode) {
    throw new HttpError(400, "operatorCode is required");
  }
  const operator = await prisma.operator.findUnique({ where: { code: operatorCode } });
  if (!operator) {
    throw new HttpError(404, "Operator not found");
  }
  const plans = await prisma.rechargePlan.findMany({
    where: { operatorId: operator.id, isActive: true },
    orderBy: [{ category: "asc" }, { amount: "asc" }],
  });
  res.json({ plans });
});

plansRouter.get("/all", authorize("ADMIN"), async (_req, res) => {
  const plans = await prisma.rechargePlan.findMany({
    include: { operator: true },
    orderBy: [{ operator: { name: "asc" } }, { amount: "asc" }],
  });
  res.json({ plans });
});

const upsertPlanSchema = z.object({
  operatorId: z.string().uuid(),
  amount: z.number().positive(),
  validity: z.string().optional(),
  data: z.string().optional(),
  talktime: z.string().optional(),
  sms: z.string().optional(),
  description: z.string().optional(),
  category: z.string().min(1).optional(),
});

plansRouter.post("/", authorize("ADMIN"), async (req, res) => {
  const parsed = upsertPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const plan = await prisma.rechargePlan.create({ data: parsed.data, include: { operator: true } });
  res.status(201).json({ plan });
});

const updatePlanSchema = upsertPlanSchema.partial().extend({ isActive: z.boolean().optional() });

plansRouter.patch("/:id", authorize("ADMIN"), async (req, res) => {
  const parsed = updatePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const plan = await prisma.rechargePlan
    .update({ where: { id: String(req.params.id) }, data: parsed.data, include: { operator: true } })
    .catch(() => null);
  if (!plan) {
    throw new HttpError(404, "Plan not found");
  }
  res.json({ plan });
});

plansRouter.delete("/:id", authorize("ADMIN"), async (req, res) => {
  await prisma.rechargePlan.delete({ where: { id: String(req.params.id) } }).catch(() => null);
  res.status(204).send();
});
