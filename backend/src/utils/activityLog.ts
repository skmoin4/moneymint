import type { Request } from "express";
import { prisma } from "../config/prisma";

export async function logActivity(
  req: Request,
  action: string,
  opts: { userId?: string | null; details?: string } = {}
) {
  await prisma.activityLog.create({
    data: {
      userId: opts.userId ?? null,
      action,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
      details: opts.details,
    },
  });
}
