import express, { Router } from "express";
import crypto from "crypto";
import { prisma } from "../config/prisma";
import { parseHttpConfig } from "../services/providerConfig";
import { interpretStatusValue, logProviderCall } from "../services/providerClient";
import { applyProviderResult } from "../services/transactionEngine";

// Public endpoint vendors call when a PENDING recharge finishes:
//   GET|POST /callback/provider/:code?token=<secret>&txnid=..&status=..&opref=..
// No user JWT exists here — the per-provider secret token in the URL (plus an optional
// IP allowlist) is the authentication. Always answers quickly with plain text, since
// vendors retry on anything but 200.
export const providerCallbackRouter = Router();

providerCallbackRouter.use(express.urlencoded({ extended: false }));

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

providerCallbackRouter.all("/provider/:code", async (req, res) => {
  const provider = await prisma.apiProvider.findUnique({ where: { code: String(req.params.code) } });
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!provider || !provider.callbackToken || !token || !safeEqual(token, provider.callbackToken)) {
    res.status(403).type("text/plain").send("FORBIDDEN");
    return;
  }

  const cfg = parseHttpConfig(provider.httpConfig);
  const ip = (req.ip ?? "").replace("::ffff:", "");
  const allowed = cfg.callbackAllowedIps
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...req.query, ...(typeof req.body === "object" && req.body ? req.body : {}) })) {
    if (k !== "token" && (typeof v === "string" || typeof v === "number")) params[k] = String(v);
  }
  const rawText = new URLSearchParams(params).toString();

  const log = (transactionId: string | null, parsedStatus: string, note: string) =>
    logProviderCall({
      provider,
      cfg,
      transactionId,
      kind: "CALLBACK",
      method: req.method,
      url: `from ${ip}`,
      requestBody: rawText,
      httpStatus: 200,
      responseBody: note,
      parsedStatus,
    });

  if (allowed.length > 0 && !allowed.includes(ip)) {
    await log(null, "REJECTED", `IP ${ip} not in callback allowlist`);
    res.status(403).type("text/plain").send("FORBIDDEN");
    return;
  }

  const ourId = params[cfg.callbackTxnIdParam];
  const vendorRef = cfg.callbackVendorRefParam ? params[cfg.callbackVendorRefParam] : undefined;
  const txn = ourId
    ? await prisma.transaction.findUnique({ where: { id: ourId } })
    : vendorRef
      ? await prisma.transaction.findFirst({ where: { vendorRefId: vendorRef, apiProviderId: provider.id } })
      : null;

  if (!txn) {
    await log(null, "IGNORED", "No matching transaction");
    res.status(404).type("text/plain").send("TXN NOT FOUND");
    return;
  }
  // If an admin re-sent this transaction to another API, a late callback from the old
  // vendor must not settle it — that needs a human to reconcile.
  if (txn.apiProviderId !== provider.id) {
    await log(txn.id, "IGNORED", "Transaction is currently with a different API — review manually");
    res.type("text/plain").send("OK");
    return;
  }

  const status = interpretStatusValue(params[cfg.callbackStatusParam], cfg) ?? "PENDING";
  if (txn.status !== "PENDING") {
    const note =
      txn.status === "SUCCESS" && status === "FAILED"
        ? "Vendor reports FAILED for a SUCCESS transaction — possible reversal, review and refund manually"
        : `Already ${txn.status}`;
    await log(txn.id, status, note);
    res.type("text/plain").send("OK");
    return;
  }

  const updated = await applyProviderResult(
    txn.id,
    {
      status,
      providerRefId: (cfg.callbackOpRefParam && params[cfg.callbackOpRefParam]) || null,
      vendorRefId: vendorRef || null,
      message: (cfg.callbackMessageParam && params[cfg.callbackMessageParam]) || null,
      rawResponse: { callback: params },
    },
    provider.id
  );
  await log(txn.id, status, `Transaction is now ${updated.status}`);
  res.type("text/plain").send("OK");
});
