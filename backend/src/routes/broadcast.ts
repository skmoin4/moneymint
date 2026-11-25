import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { getDescendantUserIds } from "../utils/hierarchy";
import { sendSms } from "../services/smsService";
import { sendWhatsapp } from "../services/whatsappService";
import { sendEmail } from "../services/emailService";

export const broadcastRouter = Router();

broadcastRouter.use(authenticate);

const canBroadcast = authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR");

const scopeSchema = z.object({
  scope: z.enum(["ALL_DOWNLINE", "SPECIFIC_USER"]),
  userId: z.string().uuid().optional(),
});

async function resolveRecipients(callerId: string, scope: "ALL_DOWNLINE" | "SPECIFIC_USER", userId?: string) {
  if (scope === "SPECIFIC_USER") {
    if (!userId) throw new HttpError(400, "userId is required for SPECIFIC_USER scope");
    const descendantIds = await getDescendantUserIds(callerId);
    if (userId !== callerId && !descendantIds.includes(userId)) {
      throw new HttpError(403, "You can only message users within your own downline");
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return user ? [user] : [];
  }
  const descendantIds = await getDescendantUserIds(callerId);
  return prisma.user.findMany({ where: { id: { in: descendantIds } } });
}

const smsSchema = scopeSchema.extend({ message: z.string().min(2).max(300) });

broadcastRouter.post("/sms", canBroadcast, async (req, res) => {
  const parsed = smsSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const recipients = await resolveRecipients(req.user!.userId, parsed.data.scope, parsed.data.userId);
  const results = await Promise.all(recipients.map((u) => sendSms(u.phone, parsed.data.message, "ANNOUNCEMENT")));
  res.json({ sent: results.filter(Boolean).length, total: recipients.length });
});

const whatsappSchema = scopeSchema.extend({ message: z.string().min(2).max(1000) });

broadcastRouter.post("/whatsapp", canBroadcast, async (req, res) => {
  const parsed = whatsappSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const recipients = await resolveRecipients(req.user!.userId, parsed.data.scope, parsed.data.userId);
  const results = await Promise.all(recipients.map((u) => sendWhatsapp(u.phone, parsed.data.message)));
  res.json({ sent: results.filter(Boolean).length, total: recipients.length });
});

const emailSchema = scopeSchema.extend({ subject: z.string().min(2).max(200), message: z.string().min(2).max(5000) });

broadcastRouter.post("/email", canBroadcast, async (req, res) => {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const recipients = await resolveRecipients(req.user!.userId, parsed.data.scope, parsed.data.userId);
  const withEmail = recipients.filter((u) => u.email);
  const results = await Promise.all(
    withEmail.map((u) => sendEmail(u.email as string, parsed.data.subject, parsed.data.message))
  );
  res.json({ sent: results.filter(Boolean).length, total: withEmail.length, skippedNoEmail: recipients.length - withEmail.length });
});

const notificationSchema = scopeSchema.extend({ message: z.string().min(2).max(500) });

// In-app notification, distinct from SMS/WhatsApp/Email — appears in the recipient's bell dropdown.
broadcastRouter.post("/notification", canBroadcast, async (req, res) => {
  const parsed = notificationSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const recipients = await resolveRecipients(req.user!.userId, parsed.data.scope, parsed.data.userId);
  await prisma.userNotification.createMany({
    data: recipients.map((u) => ({ userId: u.id, message: parsed.data.message })),
  });
  res.json({ sent: recipients.length });
});

broadcastRouter.get("/whatsapp-logs", canBroadcast, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const [logs, total] = await Promise.all([
    prisma.whatsappLog.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.whatsappLog.count(),
  ]);
  res.json({ logs, total, page, pageSize });
});

broadcastRouter.get("/email-logs", canBroadcast, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const [logs, total] = await Promise.all([
    prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.emailLog.count(),
  ]);
  res.json({ logs, total, page, pageSize });
});

// The caller's own notifications, for the TopBar bell dropdown.
broadcastRouter.get("/my-notifications", authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR", "RETAILER"), async (req, res) => {
  const notifications = await prisma.userNotification.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const unreadCount = await prisma.userNotification.count({ where: { userId: req.user!.userId, isRead: false } });
  res.json({ notifications, unreadCount });
});

broadcastRouter.post(
  "/my-notifications/mark-read",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR", "RETAILER"),
  async (req, res) => {
    await prisma.userNotification.updateMany({
      where: { userId: req.user!.userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ ok: true });
  }
);
