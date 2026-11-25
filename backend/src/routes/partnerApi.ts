import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { HttpError } from "../utils/httpError";
import { initiateRecharge } from "../services/rechargeService";
import { fetchBillAmount, payBill } from "../services/billPaymentService";
import { checkPendingTransaction } from "../services/transactionEngine";
import { partnerView } from "../services/partnerCallbacks";

/**
 * Partner (API user) API — what B2B clients' servers call. Every endpoint accepts GET
 * query parameters or a POST JSON/form body. Authentication: the API token (header
 * "X-Api-Token", or "token" parameter) AND a whitelisted server IP.
 *
 * Response "status":
 *   SUCCESS / FAILED / PENDING / REFUNDED — the transaction's state (FAILED is refunded);
 *   ERROR — the request was rejected and no transaction was created.
 */
export const partnerApiRouter = Router();

interface PartnerRequest extends Request {
  partner?: { userId: string; credentialId: string };
}

export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

function params(req: Request): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...req.query, ...(req.body && typeof req.body === "object" ? req.body : {}) })) {
    if (typeof v === "string" || typeof v === "number") merged[k.toLowerCase()] = String(v).trim();
  }
  return merged;
}

function fail(res: Response, http: number, message: string) {
  res.status(http).json({ status: "ERROR", message });
}

function tokenOf(req: Request) {
  const header = req.header("x-api-token");
  return header || params(req).token || "";
}

async function partnerAuth(req: PartnerRequest, res: Response, next: NextFunction) {
  const token = tokenOf(req);
  if (!token) return fail(res, 401, "API token missing (send header X-Api-Token)");
  const cred = await prisma.apiCredential.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { status: true } } },
  });
  if (!cred || !cred.isActive) return fail(res, 401, "Invalid or disabled API token");
  if (cred.user.status !== "ACTIVE") return fail(res, 403, `Account is ${cred.user.status.toLowerCase()}`);

  const ip = (req.ip ?? "").replace("::ffff:", "");
  const allowed = cred.allowedIps.split(",").map((v) => v.trim()).filter(Boolean);
  if (allowed.length === 0) return fail(res, 403, "No server IP whitelisted — add it under API Token & Callback in the panel");
  if (!allowed.includes(ip)) return fail(res, 403, `IP ${ip} is not whitelisted`);

  req.partner = { userId: cred.userId, credentialId: cred.id };
  prisma.apiCredential.update({ where: { id: cred.id }, data: { lastUsedAt: new Date() } }).catch(() => null);
  next();
}

// Per-token limit, separate from the panel/app limits (partners send bursts).
const partnerLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `partner:${hashToken(tokenOf(req)).slice(0, 32)}`,
  message: { status: "ERROR", message: "Rate limit exceeded (300 requests/minute)" },
});

partnerApiRouter.use(partnerLimiter, (req, res, next) => {
  partnerAuth(req, res, next).catch(next);
});

type Handler = (req: PartnerRequest, res: Response) => Promise<void>;
function route(path: string, handler: Handler) {
  const wrapped = (req: PartnerRequest, res: Response) =>
    handler(req, res).catch((err) => {
      if (err instanceof HttpError) return fail(res, err.status, err.message);
      console.error("partner api", err);
      fail(res, 500, "Internal error — check the transaction status before retrying");
    });
  partnerApiRouter.get(path, wrapped);
  partnerApiRouter.post(path, wrapped);
}

async function balanceOf(userId: string) {
  const w = await prisma.wallet.findUnique({ where: { userId }, select: { balance: true } });
  return Number(w?.balance ?? 0);
}

const txnInclude = { operator: { select: { code: true } } } as const;

function zodMessage(err: z.ZodError) {
  return err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

const clientRef = z
  .string()
  .min(1, "required")
  .max(50)
  .regex(/^[A-Za-z0-9_.-]+$/, "letters, digits, _ . - only");

/** Same client_ref again → the original transaction, never a second recharge. */
async function existingByClientRef(userId: string, ref: string) {
  return prisma.transaction.findUnique({ where: { userId_clientRef: { userId, clientRef: ref } }, include: txnInclude });
}

async function respondWithTxn(res: Response, userId: string, txnId: string, extra: Record<string, unknown> = {}) {
  const txn = await prisma.transaction.findUniqueOrThrow({ where: { id: txnId }, include: txnInclude });
  res.json({ ...partnerView(txn), balance: await balanceOf(userId), ...extra });
}

function isClientRefClash(err: unknown) {
  const e = err as { code?: string; meta?: { target?: unknown } };
  return e.code === "P2002";
}

route("/balance", async (req, res) => {
  res.json({ status: "SUCCESS", balance: await balanceOf(req.partner!.userId) });
});

route("/operators", async (_req, res) => {
  const operators = await prisma.operator.findMany({
    where: { isActive: true },
    select: { code: true, name: true, type: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  res.json({ status: "SUCCESS", operators });
});

const rechargeSchema = z.object({
  number: z.string().regex(/^\d{6,20}$/, "digits only"),
  amount: z.coerce.number().positive().max(100000),
  operator: z.string().min(2).max(30),
  client_ref: clientRef,
});

route("/recharge", async (req, res) => {
  const parsed = rechargeSchema.safeParse(params(req));
  if (!parsed.success) return fail(res, 400, zodMessage(parsed.error));
  const { number, amount, operator, client_ref } = parsed.data;
  const userId = req.partner!.userId;

  const existing = await existingByClientRef(userId, client_ref);
  if (existing) return respondWithTxn(res, userId, existing.id, { duplicate: true });

  try {
    const txn = await initiateRecharge(userId, operator.toUpperCase(), number, amount, "API", client_ref);
    await respondWithTxn(res, userId, txn.id);
  } catch (err) {
    if (isClientRefClash(err)) {
      const again = await existingByClientRef(userId, client_ref);
      if (again) return respondWithTxn(res, userId, again.id, { duplicate: true });
    }
    throw err;
  }
});

const billFetchSchema = z.object({ operator: z.string().min(2), consumer_no: z.string().min(3).max(40) });

route("/bill/fetch", async (req, res) => {
  const parsed = billFetchSchema.safeParse(params(req));
  if (!parsed.success) return fail(res, 400, zodMessage(parsed.error));
  const bill = await fetchBillAmount(parsed.data.operator.toUpperCase(), parsed.data.consumer_no);
  res.json({ status: "SUCCESS", ...bill });
});

const billPaySchema = billFetchSchema.extend({
  amount: z.coerce.number().positive().max(200000),
  client_ref: clientRef,
});

route("/bill/pay", async (req, res) => {
  const parsed = billPaySchema.safeParse(params(req));
  if (!parsed.success) return fail(res, 400, zodMessage(parsed.error));
  const { operator, consumer_no, amount, client_ref } = parsed.data;
  const userId = req.partner!.userId;

  const existing = await existingByClientRef(userId, client_ref);
  if (existing) return respondWithTxn(res, userId, existing.id, { duplicate: true });
  try {
    const txn = await payBill(userId, operator.toUpperCase(), consumer_no, amount, "API", client_ref);
    await respondWithTxn(res, userId, txn.id);
  } catch (err) {
    if (isClientRefClash(err)) {
      const again = await existingByClientRef(userId, client_ref);
      if (again) return respondWithTxn(res, userId, again.id, { duplicate: true });
    }
    throw err;
  }
});

route("/status", async (req, res) => {
  const p = params(req);
  const userId = req.partner!.userId;
  const txn = p.txn_id
    ? await prisma.transaction.findFirst({ where: { id: p.txn_id, userId }, include: txnInclude })
    : p.client_ref
      ? await existingByClientRef(userId, p.client_ref)
      : null;
  if (!txn) return fail(res, 404, p.txn_id || p.client_ref ? "Transaction not found" : "Send txn_id or client_ref");

  // A pending one that the vendor has been quiet about gets a live status check.
  const stale = !txn.lastStatusCheckAt || Date.now() - txn.lastStatusCheckAt.getTime() > 30_000;
  if (txn.status === "PENDING" && stale && Date.now() - txn.createdAt.getTime() > 30_000) {
    await checkPendingTransaction(txn.id).catch(() => null);
  }
  await respondWithTxn(res, userId, txn.id);
});

partnerApiRouter.use((_req: Request, res: Response) => fail(res, 404, "Unknown API endpoint"));
