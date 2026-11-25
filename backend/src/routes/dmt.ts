import { Router } from "express";
import { requestSource } from "../utils/requestSource";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import {
  registerRemitter,
  verifyRemitter,
  addBeneficiary,
  transferToBeneficiary,
} from "../services/dmtService";
import { transactionLimiter } from "../middleware/rateLimiters";
import { requirePinIfEnabled } from "../middleware/requirePin";

export const dmtRouter = Router();

dmtRouter.use(authenticate);

dmtRouter.get("/remitters", async (req, res) => {
  const remitters = await prisma.remitter.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ remitters });
});

dmtRouter.get("/remitters/search", async (req, res) => {
  const mobileNumber = String(req.query.mobileNumber || "");
  const remitter = await prisma.remitter.findUnique({ where: { mobileNumber } });
  if (!remitter || remitter.userId !== req.user!.userId) {
    return res.json({ remitter: null });
  }
  res.json({ remitter });
});

const registerRemitterSchema = z.object({
  name: z.string().min(2),
  mobileNumber: z.string().min(10).max(15),
});

dmtRouter.post("/remitters", async (req, res) => {
  const parsed = registerRemitterSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const remitter = await registerRemitter(req.user!.userId, parsed.data.name, parsed.data.mobileNumber);
  res.status(201).json({ remitter });
});

dmtRouter.post("/remitters/:id/verify", async (req, res) => {
  const remitter = await verifyRemitter(req.user!.userId, req.params.id);
  res.json({ remitter });
});

dmtRouter.get("/remitters/:id/beneficiaries", async (req, res) => {
  const remitter = await prisma.remitter.findUnique({ where: { id: req.params.id } });
  if (!remitter || remitter.userId !== req.user!.userId) {
    throw new HttpError(404, "Remitter not found");
  }
  const beneficiaries = await prisma.beneficiary.findMany({
    where: { remitterId: req.params.id },
    orderBy: { createdAt: "desc" },
  });
  res.json({ beneficiaries });
});

const addBeneficiarySchema = z.object({
  name: z.string().min(2),
  accountNumber: z.string().min(6).max(20),
  ifsc: z.string().min(6).max(11),
  bankName: z.string().min(2),
});

dmtRouter.post("/remitters/:id/beneficiaries", async (req, res) => {
  const parsed = addBeneficiarySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const beneficiary = await addBeneficiary(req.user!.userId, req.params.id, parsed.data);
  res.status(201).json({ beneficiary });
});

const transferSchema = z.object({
  remitterId: z.string().uuid(),
  beneficiaryId: z.string().uuid(),
  amount: z.number().positive(),
  mode: z.enum(["IMPS", "NEFT"]),
});

dmtRouter.post("/transfer", transactionLimiter, requirePinIfEnabled, async (req, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const { remitterId, beneficiaryId, amount, mode } = parsed.data;
  const transaction = await transferToBeneficiary(
    req.user!.userId,
    remitterId,
    beneficiaryId,
    amount,
    mode,
    requestSource(req)
  );
  res.status(201).json({ transaction });
});
