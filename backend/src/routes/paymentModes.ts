import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";

export const paymentModesRouter = Router();

paymentModesRouter.use(authenticate);

paymentModesRouter.get("/", async (_req, res) => {
  const modes = await prisma.paymentMode.findMany({ orderBy: { name: "asc" } });
  res.json({ modes });
});

const createSchema = z.object({ name: z.string().min(2).toUpperCase() });

paymentModesRouter.post("/", authorize("ADMIN"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const existing = await prisma.paymentMode.findUnique({ where: { name: parsed.data.name } });
  if (existing) {
    throw new HttpError(409, "This payment mode already exists");
  }
  const mode = await prisma.paymentMode.create({ data: parsed.data });
  res.status(201).json({ mode });
});

const toggleSchema = z.object({ isActive: z.boolean() });

paymentModesRouter.patch("/:id", authorize("ADMIN"), async (req, res) => {
  const parsed = toggleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const mode = await prisma.paymentMode
    .update({ where: { id: String(req.params.id) }, data: { isActive: parsed.data.isActive } })
    .catch(() => null);
  if (!mode) {
    throw new HttpError(404, "Payment mode not found");
  }
  res.json({ mode });
});

paymentModesRouter.delete("/:id", authorize("ADMIN"), async (req, res) => {
  await prisma.paymentMode.delete({ where: { id: String(req.params.id) } }).catch(() => null);
  res.status(204).send();
});
