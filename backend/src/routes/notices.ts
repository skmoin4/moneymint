import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";

export const noticesRouter = Router();

noticesRouter.use(authenticate);

noticesRouter.get("/active", async (_req, res) => {
  const notice = await prisma.notice.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ notice });
});

noticesRouter.get("/", authorize("ADMIN"), async (_req, res) => {
  const notices = await prisma.notice.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ notices });
});

const createSchema = z.object({
  message: z.string().min(3),
});

noticesRouter.post("/", authorize("ADMIN"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const notice = await prisma.$transaction(async (tx) => {
    await tx.notice.updateMany({ where: { isActive: true }, data: { isActive: false } });
    return tx.notice.create({ data: { message: parsed.data.message, isActive: true } });
  });
  res.status(201).json({ notice });
});

noticesRouter.patch("/:id", authorize("ADMIN"), async (req, res) => {
  const notice = await prisma.notice
    .update({ where: { id: String(req.params.id) }, data: { isActive: false } })
    .catch(() => null);
  if (!notice) {
    throw new HttpError(404, "Notice not found");
  }
  res.json({ notice });
});
