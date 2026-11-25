import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";

export const circlesRouter = Router();

circlesRouter.use(authenticate);

circlesRouter.get("/", async (_req, res) => {
  const circles = await prisma.circle.findMany({ orderBy: { name: "asc" } });
  res.json({ circles });
});

const createSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(1).toUpperCase(),
  state: z.string().min(2),
});

circlesRouter.post("/", authorize("ADMIN"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const existing = await prisma.circle.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    throw new HttpError(409, "A circle with this code already exists");
  }
  const circle = await prisma.circle.create({ data: parsed.data });
  res.status(201).json({ circle });
});

const updateSchema = z.object({ isActive: z.boolean() });

circlesRouter.patch("/:id", authorize("ADMIN"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const circle = await prisma.circle
    .update({ where: { id: String(req.params.id) }, data: parsed.data })
    .catch(() => null);
  if (!circle) {
    throw new HttpError(404, "Circle not found");
  }
  res.json({ circle });
});
