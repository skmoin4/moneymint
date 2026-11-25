import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { fetchBillAmount, payBill } from "../services/billPaymentService";
import { transactionLimiter } from "../middleware/rateLimiters";
import { requirePinIfEnabled } from "../middleware/requirePin";
import { requestSource } from "../utils/requestSource";
import { clientRefField, runOnce } from "../utils/idempotency";

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
  clientRef: clientRefField,
});

bbpsRouter.post("/pay", transactionLimiter, requirePinIfEnabled, async (req, res) => {
  const parsed = paySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const { operatorCode, consumerNumber, amount, clientRef } = parsed.data;
  const userId = req.user!.userId;
  const { transaction, duplicate } = await runOnce(userId, clientRef, () =>
    payBill(userId, operatorCode, consumerNumber, amount, requestSource(req), clientRef)
  );
  res.status(duplicate ? 200 : 201).json({ transaction, ...(duplicate ? { duplicate } : {}) });
});
