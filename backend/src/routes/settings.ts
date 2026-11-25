import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";

export const settingsRouter = Router();

settingsRouter.use(authenticate, authorize("ADMIN"));

settingsRouter.get("/:key", async (req, res) => {
  const setting = await prisma.systemSetting.findUnique({ where: { key: String(req.params.key) } });
  res.json({ key: req.params.key, value: setting?.value ?? null });
});

const putSchema = z.object({ value: z.string() });

settingsRouter.put("/:key", async (req, res) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const setting = await prisma.systemSetting.upsert({
    where: { key: String(req.params.key) },
    update: { value: parsed.data.value },
    create: { key: String(req.params.key), value: parsed.data.value },
  });
  res.json({ key: setting.key, value: setting.value });
});
