import { Router } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";

export const bankAccountsRouter = Router();

bankAccountsRouter.use(authenticate);

// Without ?mine=1: the active accounts this user may deposit into for a balance request
// (their parent's own accounts; the company's if the parent is the root admin).
// With ?mine=1 (managers): the accounts this user manages, active or not.
bankAccountsRouter.get("/", async (req, res) => {
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId }, select: { id: true, parentId: true, role: true } });
  if (req.query.mine === "1") {
    const isRootAdmin = me.role === "ADMIN" && me.parentId === null;
    const accounts = await prisma.bankAccount.findMany({
      where: isRootAdmin ? { OR: [{ ownerId: null }, { ownerId: me.id }] } : { ownerId: me.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ accounts });
    return;
  }
  if (!me.parentId) {
    res.json({ accounts: [] });
    return;
  }
  const parent = await prisma.user.findUniqueOrThrow({ where: { id: me.parentId }, select: { id: true, parentId: true } });
  const accounts = await prisma.bankAccount.findMany({
    where: { isActive: true, OR: [{ ownerId: parent.id }, ...(parent.parentId === null ? [{ ownerId: null }] : [])] },
    orderBy: { createdAt: "desc" },
  });
  res.json({ accounts });
});

/** Root admin manages company accounts (ownerId null); everyone else only their own. */
async function canManage(userId: string, account: { ownerId: string | null }) {
  if (account.ownerId === userId) return true;
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, parentId: true } });
  return account.ownerId === null && me.role === "ADMIN" && me.parentId === null;
}

const createSchema = z.object({
  accountName: z.string().min(2),
  accountNumber: z.string().min(6),
  ifsc: z.string().min(6).max(11),
  bankName: z.string().min(2),
  upiId: z.string().optional(),
});

bankAccountsRouter.post("/", authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId }, select: { role: true, parentId: true } });
  // The root admin's accounts are the company's; managers' accounts are their own.
  const ownerId = me.role === "ADMIN" && me.parentId === null ? null : req.user!.userId;
  const account = await prisma.bankAccount.create({ data: { ...parsed.data, ownerId } });
  res.status(201).json({ account });
});

const updateSchema = z.object({
  isActive: z.boolean().optional(),
  upiId: z.string().optional(),
});

bankAccountsRouter.patch("/:id", authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const existing = await prisma.bankAccount.findUnique({ where: { id: String(req.params.id) } });
  if (!existing || !(await canManage(req.user!.userId, existing))) {
    throw new HttpError(404, "Bank account not found");
  }
  const account = await prisma.bankAccount.update({ where: { id: existing.id }, data: parsed.data });
  res.json({ account });
});

// Generates a real, standards-compliant UPI deep-link QR (upi://pay?...) that
// any UPI app can scan — genuinely functional if a real VPA is configured,
// not a placeholder image.
bankAccountsRouter.get("/:id/upi-qr", async (req, res) => {
  const account = await prisma.bankAccount.findUnique({ where: { id: String(req.params.id) } });
  if (!account || !account.upiId) {
    throw new HttpError(404, "This account has no UPI ID configured");
  }

  const amount = req.query.amount ? Number(req.query.amount) : undefined;
  const params = new URLSearchParams({
    pa: account.upiId,
    pn: account.accountName,
    cu: "INR",
  });
  if (amount && amount > 0) {
    params.set("am", amount.toFixed(2));
  }
  const upiLink = `upi://pay?${params.toString()}`;

  const qrCodeDataUrl = await QRCode.toDataURL(upiLink, { width: 300, margin: 1 });
  res.json({ upiLink, qrCodeDataUrl });
});
