import { prisma } from "../config/prisma";
import { checkPendingTransaction } from "./transactionEngine";

const INTERVAL_MS = 60_000;
const MIN_AGE_MS = 90_000; // give the vendor's callback a chance first
const RECHECK_GAP_MS = 120_000;
const MAX_CHECKS = 30; // ~1 hour of checks, after which it is left for a human (Pendings)
const BATCH = 50;

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    const due = await prisma.transaction.findMany({
      where: {
        status: "PENDING",
        type: { not: "AEPS" },
        createdAt: { lt: new Date(now - MIN_AGE_MS) },
        statusCheckCount: { lt: MAX_CHECKS },
        OR: [{ lastStatusCheckAt: null }, { lastStatusCheckAt: { lt: new Date(now - RECHECK_GAP_MS) } }],
      },
      orderBy: { createdAt: "asc" },
      take: BATCH,
      select: { id: true },
    });
    for (const t of due) {
      await checkPendingTransaction(t.id).catch((err) => console.error(`status check failed for ${t.id}`, err));
    }
  } finally {
    running = false;
  }
}

/** Periodically asks vendors about PENDING transactions whose callback never arrived. */
export function startStatusPoller() {
  if (process.env.DISABLE_STATUS_POLLER === "true") return;
  setInterval(() => {
    tick().catch((err) => console.error("status poller tick failed", err));
  }, INTERVAL_MS).unref();
}
