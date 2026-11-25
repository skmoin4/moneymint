import crypto from "crypto";
import { prisma } from "../config/prisma";
import type { Prisma } from "../generated/prisma/client";
import { assertPublicHttpUrl } from "../utils/safeUrl";

type Tx = Prisma.TransactionClient;

const BACKOFF_MINUTES = [1, 5, 15, 60, 180];
const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;

export function signPayload(secret: string, data: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

/** The fields an API user receives, in API responses and callbacks alike. */
export function partnerView(t: {
  id: string;
  clientRef: string | null;
  status: string;
  identifier: string;
  amount: Prisma.Decimal | number | string;
  providerRefId: string | null;
  statusMessage: string | null;
  operator: { code: string };
  updatedAt: Date;
}) {
  return {
    status: t.status,
    txn_id: t.id,
    client_ref: t.clientRef,
    number: t.identifier,
    operator: t.operator.code,
    amount: Number(t.amount),
    operator_ref: t.providerRefId,
    message: t.statusMessage ?? (t.status === "REFUNDED" ? "Refunded to wallet" : null),
    time: t.updatedAt.toISOString(),
  };
}

/**
 * Queues the outcome callback for an API user's transaction — called inside the same DB
 * transaction that settles or refunds it, so the callback exists if and only if the
 * outcome was committed.
 */
export async function enqueuePartnerCallback(tx: Tx, transactionId: string) {
  const txn = await tx.transaction.findUnique({
    where: { id: transactionId },
    include: { operator: { select: { code: true } } },
  });
  if (!txn || txn.source !== "API" || txn.status === "PENDING") return;
  const cred = await tx.apiCredential.findUnique({ where: { userId: txn.userId } });
  if (!cred?.callbackUrl) return;
  await tx.partnerCallback.create({
    data: {
      userId: txn.userId,
      transactionId,
      url: cred.callbackUrl,
      method: cred.callbackMethod,
      payload: JSON.stringify(partnerView(txn)),
    },
  });
}

async function deliver(cb: { id: string; userId: string; url: string; method: string; payload: string; attempts: number }) {
  const cred = await prisma.apiCredential.findUnique({ where: { userId: cb.userId } });
  const secret = cred?.callbackSecret ?? "";
  let httpStatus: number | null = null;
  let error: string | null = await assertPublicHttpUrl(cb.url);
  if (!error) try {
    let res: Response;
    if (cb.method === "GET") {
      const params = new URLSearchParams(
        Object.entries(JSON.parse(cb.payload) as Record<string, unknown>).map(([k, v]) => [k, v === null ? "" : String(v)])
      );
      const qs = params.toString();
      params.set("signature", signPayload(secret, qs));
      const sep = cb.url.includes("?") ? "&" : "?";
      res = await fetch(`${cb.url}${sep}${params.toString()}`, { signal: AbortSignal.timeout(10_000) });
    } else {
      res = await fetch(cb.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-MoneyMint-Signature": signPayload(secret, cb.payload) },
        body: cb.payload,
        signal: AbortSignal.timeout(10_000),
      });
    }
    httpStatus = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = (err as Error).message.slice(0, 300);
  }

  const attempts = cb.attempts + 1;
  if (!error) {
    await prisma.partnerCallback.update({ where: { id: cb.id }, data: { status: "SENT", attempts, lastHttpStatus: httpStatus, lastError: null, sentAt: new Date() } });
    return;
  }
  const exhausted = attempts >= MAX_ATTEMPTS;
  await prisma.partnerCallback.update({
    where: { id: cb.id },
    data: {
      status: exhausted ? "FAILED" : "PENDING",
      attempts,
      lastHttpStatus: httpStatus,
      lastError: error,
      nextAttemptAt: new Date(Date.now() + (BACKOFF_MINUTES[attempts - 1] ?? 60) * 60_000),
    },
  });
}

let running = false;

export async function deliverDueCallbacks() {
  if (running) return;
  running = true;
  try {
    const due = await prisma.partnerCallback.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: "asc" },
      take: 50,
    });
    await Promise.all(due.map((cb) => deliver(cb).catch((err) => console.error("partner callback failed", cb.id, err))));
  } finally {
    running = false;
  }
}

export function startPartnerCallbackWorker() {
  setInterval(() => {
    deliverDueCallbacks().catch((err) => console.error("partner callback worker", err));
  }, 10_000).unref();
}
