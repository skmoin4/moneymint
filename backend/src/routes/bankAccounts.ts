import { Router } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";

export const bankAccountsRouter = Router();

bankAccountsRouter.use(authenticate);

bankAccountsRouter.get("/", async (_req, res) => {
  const accounts = await prisma.bankAccount.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ accounts });
});

const createSchema = z.object({
  accountName: z.string().min(2),
  accountNumber: z.string().min(6),
  ifsc: z.string().min(6).max(11),
  bankName: z.string().min(2),
  upiId: z.string().optional(),
});

bankAccountsRouter.post("/", authorize("ADMIN"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const account = await prisma.bankAccount.create({ data: parsed.data });
  res.status(201).json({ account });
});

const updateSchema = z.object({
  isActive: z.boolean().optional(),
  upiId: z.string().optional(),
});

bankAccountsRouter.patch("/:id", authorize("ADMIN"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const account = await prisma.bankAccount
    .update({ where: { id: String(req.params.id) }, data: parsed.data })
    .catch(() => null);
  if (!account) {
    throw new HttpError(404, "Bank account not found");
  }
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
