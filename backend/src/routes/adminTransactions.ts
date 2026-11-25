import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { toCsv } from "../utils/csv";
import { getDescendantUserIds } from "../utils/hierarchy";
import { logActivity } from "../utils/activityLog";
import { PROVIDER_ADMIN_SELECT, PROVIDER_PUBLIC_SELECT } from "../utils/providerSelect";
import { Prisma } from "../generated/prisma/client";
import {
  settleTransaction,
  resendToProvider,
  refundSuccessfulTransaction,
} from "../services/transactionEngine";

// Admin "Transaction History" / "Pendings" screens: every transaction across the caller's
// downline (the whole platform for ADMIN), with the full filter bar, per-status totals,
// bulk Action (Success / Failed / Refund) and "Send to API" re-routing.
export const adminTransactionsRouter = Router();

adminTransactionsRouter.use(authenticate, authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"));

const STATUS_VALUES = ["PENDING", "SUCCESS", "FAILED", "REFUNDED"] as const;
const TYPE_VALUES = ["RECHARGE", "BBPS", "DMT", "AEPS"] as const;
const SOURCE_VALUES = ["APP", "WEB", "API", "MANUAL", "QUEUE"] as const;

/** Users the caller may see/act on. null = no restriction (ADMIN sees everything). */
async function scopeUserIds(req: Request): Promise<string[] | null> {
  if (req.user!.role === "ADMIN") return null;
  const descendants = await getDescendantUserIds(req.user!.userId);
  return [req.user!.userId, ...descendants];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function buildWhere(req: Request): Promise<Prisma.TransactionWhereInput> {
  const q = req.query as Record<string, unknown>;
  const and: Prisma.TransactionWhereInput[] = [];

  const scope = await scopeUserIds(req);
  if (scope) and.push({ userId: { in: scope } });

  const from = str(q.from);
  const to = str(q.to);
  if (from && !isNaN(Date.parse(from))) and.push({ createdAt: { gte: new Date(from) } });
  if (to && !isNaN(Date.parse(to))) {
    const end = new Date(to);
    // A bare date (no time part) means "the whole of that day".
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) end.setHours(23, 59, 59, 999);
    and.push({ createdAt: { lte: end } });
  }

  const status = str(q.status);
  if ((STATUS_VALUES as readonly string[]).includes(status)) and.push({ status: status as (typeof STATUS_VALUES)[number] });

  const type = str(q.type);
  if ((TYPE_VALUES as readonly string[]).includes(type)) and.push({ type: type as (typeof TYPE_VALUES)[number] });

  const source = str(q.source);
  if ((SOURCE_VALUES as readonly string[]).includes(source)) and.push({ source });

  const operatorId = str(q.operatorId);
  if (operatorId) and.push({ operatorId });

  const apiProviderId = str(q.apiProviderId);
  if (apiProviderId) and.push({ apiProviderId });

  const userId = str(q.userId);
  if (userId) and.push({ userId });

  const mobile = str(q.mobile);
  if (mobile) and.push({ identifier: { contains: mobile } });

  const txnId = str(q.txnId);
  if (txnId) and.push({ id: { startsWith: txnId } });

  const opRefId = str(q.opRefId);
  if (opRefId) and.push({ providerRefId: { contains: opRefId, mode: "insensitive" } });

  const amount = Number(str(q.amount));
  if (str(q.amount) && !isNaN(amount)) and.push({ amount });

  const user = str(q.user);
  if (user) {
    and.push({ user: { OR: [{ phone: { contains: user } }, { name: { contains: user, mode: "insensitive" } }] } });
  }

  const parentUser = str(q.parentUser);
  if (parentUser) {
    and.push({
      user: {
        parent: { OR: [{ phone: { contains: parentUser } }, { name: { contains: parentUser, mode: "insensitive" } }] },
      },
    });
  }

  if (q.blankOpTxn === "1") and.push({ providerRefId: null });
  if (q.blankResponse === "1") and.push({ apiResponse: { equals: Prisma.DbNull } });

  if (q.onlyComplaints === "1") {
    const complaints = await prisma.complaint.findMany({
      where: { transactionRef: { not: null } },
      select: { transactionRef: true },
    });
    and.push({ id: { in: complaints.map((c) => c.transactionRef!) } });
  }

  return and.length ? { AND: and } : {};
}

function includeFor(req: Request) {
  return {
    operator: { select: { id: true, name: true, code: true, type: true } },
    apiProvider: { select: req.user!.role === "ADMIN" ? PROVIDER_ADMIN_SELECT : PROVIDER_PUBLIC_SELECT },
    user: {
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        parent: { select: { id: true, name: true, phone: true } },
      },
    },
  } as const;
}

async function statusSummary(where: Prisma.TransactionWhereInput) {
  const grouped = await prisma.transaction.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
    _sum: { amount: true },
  });
  const summary: Record<string, { count: number; amount: string }> = {};
  for (const s of STATUS_VALUES) summary[s] = { count: 0, amount: "0" };
  for (const g of grouped) summary[g.status] = { count: g._count._all, amount: (g._sum.amount ?? 0).toString() };
  return summary;
}

const MAX_UNPAGED = 5000;

adminTransactionsRouter.get("/", async (req, res) => {
  const where = await buildWhere(req);
  const disablePaging = req.query.disablePaging === "1";
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = disablePaging ? MAX_UNPAGED : Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
  // Pendings are worked oldest-first; history is read newest-first.
  const order = req.query.order === "asc" ? "asc" : "desc";

  const [transactions, total, summary] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: order },
      skip: disablePaging ? 0 : (page - 1) * pageSize,
      take: pageSize,
      include: includeFor(req),
    }),
    prisma.transaction.count({ where }),
    statusSummary(where),
  ]);

  res.json({ transactions, total, page, pageSize, summary });
});

adminTransactionsRouter.get("/export", async (req, res) => {
  const where = await buildWhere(req);
  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: MAX_UNPAGED,
    include: includeFor(req),
  });

  const rows = transactions.map((t) => ({
    txnId: t.id,
    date: t.createdAt.toISOString(),
    user: `${t.user.name} (${t.user.phone})`,
    parent: t.user.parent ? `${t.user.parent.name} (${t.user.parent.phone})` : "",
    type: t.type,
    operator: t.operator.name,
    identifier: t.identifier,
    amount: t.amount.toString(),
    deduction: t.deduction.toString(),
    commission: t.commission.toString(),
    status: t.status,
    api: t.apiProvider.name,
    opRefId: t.providerRefId ?? "",
    source: t.source,
    procSeconds: Math.round((t.updatedAt.getTime() - t.createdAt.getTime()) / 1000),
  }));

  const csv = toCsv(rows, Object.keys(rows[0] ?? { txnId: "" }) as (keyof (typeof rows)[number])[]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="transaction-history.csv"`);
  res.send(csv);
});

async function assertInScope(req: Request, ids: string[]) {
  const scope = await scopeUserIds(req);
  const txns = await prisma.transaction.findMany({ where: { id: { in: ids } }, select: { id: true, userId: true } });
  if (txns.length !== ids.length) throw new HttpError(404, "One or more transactions were not found");
  if (scope && txns.some((t) => !scope.includes(t.userId))) {
    throw new HttpError(403, "You can only act on transactions within your own downline");
  }
  return txns;
}

const actionSchema = z.object({
  outcome: z.enum(["SUCCESS", "FAILED", "REFUND"]),
  providerRefId: z.string().max(100).optional(),
  remark: z.string().max(200).optional(),
});

async function applyOutcome(
  txnId: string,
  userId: string,
  actorId: string,
  input: z.infer<typeof actionSchema>
) {
  if (input.outcome === "REFUND") {
    return refundSuccessfulTransaction(txnId, input.remark);
  }
  return settleTransaction(txnId, userId, "Manually resolved transaction", {
    success: input.outcome === "SUCCESS",
    providerRefId: input.providerRefId?.trim() || null,
    rawResponse: { manuallyResolvedBy: actorId, outcome: input.outcome, remark: input.remark ?? null },
  });
}

// Single-row "Action" dialog: mark a pending txn Success (optionally with the operator's
// reference id) or Failed, or refund an already-successful one.
adminTransactionsRouter.post("/:id/action", async (req, res) => {
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const [txn] = await assertInScope(req, [String(req.params.id)]);

  const updated = await applyOutcome(txn.id, txn.userId, req.user!.userId, parsed.data);
  await logActivity(req, "TXN_ACTION", {
    userId: req.user!.userId,
    details: `${parsed.data.outcome} on ${txn.id}${parsed.data.remark ? ` — ${parsed.data.remark}` : ""}`,
  });
  res.json({ transaction: updated });
});

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  outcome: z.enum(["SUCCESS", "FAILED", "REFUND"]),
});

// "Apply action: [Success|Failed|Refund] → Go" on the checked rows. Each row settles in its
// own DB transaction, so one bad row (e.g. already settled) doesn't block the rest.
adminTransactionsRouter.post("/bulk-action", async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const txns = await assertInScope(req, parsed.data.ids);

  const failures: { id: string; error: string }[] = [];
  let done = 0;
  for (const t of txns) {
    try {
      await applyOutcome(t.id, t.userId, req.user!.userId, { outcome: parsed.data.outcome });
      done++;
    } catch (err) {
      failures.push({ id: t.id, error: err instanceof Error ? err.message : "Failed" });
    }
  }
  await logActivity(req, "TXN_BULK_ACTION", {
    userId: req.user!.userId,
    details: `${parsed.data.outcome} on ${done}/${txns.length} transactions`,
  });
  res.json({ done, failures });
});

const sendToApiSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  apiProviderId: z.string().uuid(),
  background: z.boolean().optional(),
});

// "Send to API: [provider] → Send" — re-submits checked PENDING rows to another provider.
// With background=true the request returns immediately and the rows settle on their own
// (the Pendings screen auto-refreshes), matching "Process in background".
adminTransactionsRouter.post("/send-to-api", authorize("ADMIN"), async (req, res) => {
  const parsed = sendToApiSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const { ids, apiProviderId, background } = parsed.data;
  await assertInScope(req, ids);

  const run = async () => {
    const failures: { id: string; error: string }[] = [];
    let done = 0;
    for (const id of ids) {
      try {
        await resendToProvider(id, apiProviderId);
        done++;
      } catch (err) {
        failures.push({ id, error: err instanceof Error ? err.message : "Failed" });
      }
    }
    return { done, failures };
  };

  await logActivity(req, "TXN_SEND_TO_API", {
    userId: req.user!.userId,
    details: `${ids.length} transaction(s) sent to provider ${apiProviderId}${background ? " (background)" : ""}`,
  });

  if (background) {
    run().catch((err) => console.error("send-to-api background run failed", err));
    res.status(202).json({ queued: ids.length });
    return;
  }
  res.json(await run());
});
