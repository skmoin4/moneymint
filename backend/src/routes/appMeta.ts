import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth";
import { HttpError } from "../utils/httpError";

// Endpoints the mobile app needs that aren't about money: startup config (version gate,
// maintenance notice, support contacts) and push-notification device tokens.
export const appMetaRouter = Router();

const CONFIG_KEYS = ["appMinVersion", "appLatestVersion", "appUpdateUrl", "maintenanceMessage", "supportPhone", "supportEmail", "supportHours"];

// Public (called before login). The app compares its own version: below minVersion →
// force update screen; below latestVersion → optional "update available".
appMetaRouter.get("/config", async (_req, res) => {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: CONFIG_KEYS } } });
  const v = (k: string) => rows.find((r) => r.key === k)?.value?.trim() || null;
  res.json({
    minVersion: v("appMinVersion") ?? "1.0.0",
    latestVersion: v("appLatestVersion") ?? v("appMinVersion") ?? "1.0.0",
    updateUrl: v("appUpdateUrl"),
    maintenance: { active: Boolean(v("maintenanceMessage")), message: v("maintenanceMessage") },
    support: { phone: v("supportPhone"), email: v("supportEmail"), hours: v("supportHours") },
  });
});

const deviceSchema = z.object({
  token: z.string().min(10).max(4096),
  platform: z.enum(["android", "ios", "web"]),
  appVersion: z.string().max(20).optional(),
});

// Register / refresh this device's FCM token after login (and whenever FCM rotates it).
// A token moves to whoever logged in last on that device.
appMetaRouter.post("/devices", authenticate, async (req, res) => {
  const parsed = deviceSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const { token, platform, appVersion } = parsed.data;
  await prisma.deviceToken.upsert({
    where: { token },
    update: { userId: req.user!.userId, platform, appVersion, lastSeenAt: new Date() },
    create: { userId: req.user!.userId, token, platform, appVersion },
  });
  res.json({ ok: true });
});

// Call on logout so this device stops receiving the user's notifications.
appMetaRouter.delete("/devices", authenticate, async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : typeof req.query.token === "string" ? req.query.token : "";
  if (!token) throw new HttpError(400, "token is required");
  await prisma.deviceToken.deleteMany({ where: { token, userId: req.user!.userId } });
  res.json({ ok: true });
});
