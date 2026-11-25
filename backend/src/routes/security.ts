import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";

export const securityRouter = Router();

securityRouter.use(authenticate, authorize("ADMIN"));

securityRouter.get("/activity-logs", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const action = req.query.action;

  const where: Record<string, unknown> = {};
  if (typeof action === "string" && action.trim()) {
    where.action = action;
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activityLog.count({ where }),
  ]);

  const userIds = [...new Set(logs.map((l) => l.userId).filter((id): id is string => Boolean(id)))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, phone: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  res.json({
    logs: logs.map((l) => ({ ...l, user: l.userId ? userMap.get(l.userId) : null })),
    total,
    page,
    pageSize,
  });
});

securityRouter.get("/sms-logs", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

  const [logs, total] = await Promise.all([
    prisma.smsLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.smsLog.count(),
  ]);

  res.json({ logs, total, page, pageSize });
});

securityRouter.get("/ip-whitelist", async (_req, res) => {
  const entries = await prisma.ipWhitelistEntry.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ entries });
});

const createIpSchema = z.object({
  ipAddress: z.string().min(3),
  description: z.string().optional(),
});

securityRouter.post("/ip-whitelist", async (req, res) => {
  const parsed = createIpSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const existing = await prisma.ipWhitelistEntry.findUnique({
    where: { ipAddress: parsed.data.ipAddress },
  });
  if (existing) {
    throw new HttpError(409, "This IP is already whitelisted");
  }
  const entry = await prisma.ipWhitelistEntry.create({ data: parsed.data });
  res.status(201).json({ entry });
});

const updateIpSchema = z.object({ isActive: z.boolean() });

securityRouter.patch("/ip-whitelist/:id", async (req, res) => {
  const parsed = updateIpSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const entry = await prisma.ipWhitelistEntry
    .update({ where: { id: String(req.params.id) }, data: parsed.data })
    .catch(() => null);
  if (!entry) {
    throw new HttpError(404, "Entry not found");
  }
  res.json({ entry });
});

securityRouter.delete("/ip-whitelist/:id", async (req, res) => {
  await prisma.ipWhitelistEntry.delete({ where: { id: String(req.params.id) } }).catch(() => null);
  res.status(204).send();
});
