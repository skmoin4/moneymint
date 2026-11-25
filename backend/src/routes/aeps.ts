import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { performAepsTransaction } from "../services/aepsService";
import { transactionLimiter } from "../middleware/rateLimiters";
import { requirePinIfEnabled } from "../middleware/requirePin";

export const aepsRouter = Router();

aepsRouter.use(authenticate);
aepsRouter.use(transactionLimiter);

const withdrawalSchema = z.object({
  aadhaarNumber: z.string().regex(/^\d{12}$/, "Aadhaar number must be 12 digits"),
  bankName: z.string().min(2),
  amount: z.number().positive().max(10000),
});

aepsRouter.post("/withdrawal", requirePinIfEnabled, async (req, res) => {
  const parsed = withdrawalSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const { aadhaarNumber, bankName, amount } = parsed.data;
  const transaction = await performAepsTransaction(
    req.user!.userId,
    aadhaarNumber,
    bankName,
    "CASH_WITHDRAWAL",
    amount
  );
  res.status(201).json({ transaction });
});

const balanceEnquirySchema = z.object({
  aadhaarNumber: z.string().regex(/^\d{12}$/, "Aadhaar number must be 12 digits"),
  bankName: z.string().min(2),
});

aepsRouter.post("/balance-enquiry", async (req, res) => {
  const parsed = balanceEnquirySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const { aadhaarNumber, bankName } = parsed.data;
  const transaction = await performAepsTransaction(
    req.user!.userId,
    aadhaarNumber,
    bankName,
    "BALANCE_ENQUIRY",
    0
  );
  res.status(201).json({ transaction });
});
