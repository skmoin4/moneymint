import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { fetchBillAmount, payBill } from "../services/billPaymentService";
import { transactionLimiter } from "../middleware/rateLimiters";
import { requirePinIfEnabled } from "../middleware/requirePin";

export const bbpsRouter = Router();

bbpsRouter.use(authenticate);

const fetchBillSchema = z.object({
  operatorCode: z.string().min(2),
  consumerNumber: z.string().min(3).max(30),
});

bbpsRouter.post("/fetch-bill", async (req, res) => {
  const parsed = fetchBillSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const bill = await fetchBillAmount(parsed.data.operatorCode, parsed.data.consumerNumber);
  res.json({ bill });
});

const paySchema = z.object({
  operatorCode: z.string().min(2),
  consumerNumber: z.string().min(3).max(30),
  amount: z.number().positive(),
});

bbpsRouter.post("/pay", transactionLimiter, requirePinIfEnabled, async (req, res) => {
  const parsed = paySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const { operatorCode, consumerNumber, amount } = parsed.data;
  const transaction = await payBill(req.user!.userId, operatorCode, consumerNumber, amount);
  res.status(201).json({ transaction });
});
