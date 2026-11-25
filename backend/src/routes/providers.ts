import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { logActivity } from "../utils/activityLog";
import { PROVIDER_PUBLIC_SELECT } from "../utils/providerSelect";
import { httpConfigSchema, parseHttpConfig } from "../services/providerConfig";
import { callbackUrlFor, newCallbackToken, parseReply, interpretStatusValue, renderTemplate } from "../services/providerClient";

export const providersRouter = Router();

providersRouter.use(authenticate, authorize("ADMIN"));

// Credentials are write-only: the panel sees a hint of the key, never the secret.
function maskKey(v: string) {
  return v.length <= 4 ? "****" : `${v.slice(0, 4)}${"*".repeat(Math.min(12, v.length - 4))}`;
}

providersRouter.get("/", async (_req, res) => {
  const providers = await prisma.apiProvider.findMany({ orderBy: { name: "asc" }, omit: { httpConfig: true, callbackToken: true } });
  res.json({ providers: providers.map((p) => ({ ...p, apiKey: maskKey(p.apiKey), apiSecret: "********" })) });
});

// ---- API Parsing Setting -------------------------------------------------------------

providersRouter.get("/:id/integration", async (req, res) => {
  const provider = await prisma.apiProvider.findUnique({
    where: { id: String(req.params.id) },
    include: {
      operatorMappings: {
        include: { operator: { select: { id: true, name: true, code: true, type: true } } },
        orderBy: [{ operator: { name: "asc" } }, { priority: "asc" }],
      },
    },
  });
  if (!provider) throw new HttpError(404, "Provider not found");
  res.json({
    id: provider.id,
    name: provider.name,
    code: provider.code,
    integrationType: provider.integrationType,
    httpConfig: parseHttpConfig(provider.httpConfig),
    callbackUrl: callbackUrlFor(provider),
    mappings: provider.operatorMappings.map((m) => ({
      id: m.id,
      priority: m.priority,
      isActive: m.isActive,
      providerOperatorCode: m.providerOperatorCode,
      operator: m.operator,
    })),
  });
});

const integrationSchema = z.object({
  integrationType: z.enum(["MOCK", "HTTP"]),
  httpConfig: httpConfigSchema,
});

providersRouter.put("/:id/integration", async (req, res) => {
  const parsed = integrationSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const existing = await prisma.apiProvider.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw new HttpError(404, "Provider not found");
  if (parsed.data.integrationType === "HTTP" && !parsed.data.httpConfig.url.trim()) {
    throw new HttpError(400, "A recharge URL is required for an HTTP integration");
  }
  const provider = await prisma.apiProvider.update({
    where: { id: existing.id },
    data: {
      integrationType: parsed.data.integrationType,
      httpConfig: parsed.data.httpConfig,
      // A real vendor needs a callback URL from day one.
      callbackToken: existing.callbackToken ?? (parsed.data.integrationType === "HTTP" ? newCallbackToken() : null),
    },
  });
  await logActivity(req, "PROVIDER_INTEGRATION_UPDATED", {
    userId: req.user!.userId,
    details: `${provider.name}: ${provider.integrationType}`,
  });
  res.json({ integrationType: provider.integrationType, callbackUrl: callbackUrlFor(provider) });
});

providersRouter.post("/:id/callback-token", async (req, res) => {
  const provider = await prisma.apiProvider
    .update({ where: { id: String(req.params.id) }, data: { callbackToken: newCallbackToken() } })
    .catch(() => null);
  if (!provider) throw new HttpError(404, "Provider not found");
  await logActivity(req, "PROVIDER_CALLBACK_TOKEN_ROTATED", { userId: req.user!.userId, details: provider.name });
  res.json({ callbackUrl: callbackUrlFor(provider) });
});

const SAMPLE_VARS = {
  mobile: "9876543210",
  number: "9876543210",
  amount: "199",
  opcode: "JIO",
  txnid: "TXN-SAMPLE-123",
  vendorref: "VREF-SAMPLE-456",
  apikey: "{apikey}",
  apisecret: "{apisecret}",
  memberid: "{memberid}",
};

// Renders the request with sample values so the admin can compare it against the
// vendor's API document before going live. Credentials stay as placeholders.
providersRouter.post("/:id/preview-request", async (req, res) => {
  const parsed = httpConfigSchema.safeParse(req.body?.httpConfig ?? {});
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const cfg = parsed.data;
  const provider = await prisma.apiProvider.findUnique({ where: { id: String(req.params.id) } });
  if (!provider) throw new HttpError(404, "Provider not found");
  const vars = { ...SAMPLE_VARS, callbackurl: callbackUrlFor(provider) ?? "" };
  const bodyMode = cfg.contentType === "JSON" ? "json" : "form";
  // Show credential placeholders literally rather than URL-encoded.
  const show = (v: string) => v.replace(/%7B(apikey|apisecret|memberid)%7D/gi, "{$1}");
  res.json({
    recharge: {
      method: cfg.method,
      url: show(renderTemplate(cfg.url, vars, "url")),
      body: cfg.method === "POST" ? show(renderTemplate(cfg.bodyTemplate, vars, bodyMode)) : null,
    },
    statusCheck: cfg.statusCheckUrl
      ? {
          method: cfg.statusCheckMethod,
          url: show(renderTemplate(cfg.statusCheckUrl, vars, "url")),
          body: cfg.statusCheckMethod === "POST" ? show(renderTemplate(cfg.statusCheckBodyTemplate, vars, bodyMode)) : null,
        }
      : null,
  });
});

const testParseSchema = z.object({
  httpConfig: httpConfigSchema,
  kind: z.enum(["REQUEST", "STATUS_CHECK", "CALLBACK"]),
  sample: z.string().max(20000),
});

// Paste a sample reply from the vendor's document and see exactly how it will be read.
providersRouter.post("/:id/test-parse", async (req, res) => {
  const parsed = testParseSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const { httpConfig: cfg, kind, sample } = parsed.data;

  if (kind === "CALLBACK") {
    const text = sample.trim().replace(/^.*\?/, "");
    let params: Record<string, string>;
    try {
      params = text.startsWith("{") ? JSON.parse(text) : Object.fromEntries(new URLSearchParams(text));
    } catch {
      throw new HttpError(400, "Callback sample must be a query string (a=1&b=2) or JSON");
    }
    res.json({
      status: interpretStatusValue(params[cfg.callbackStatusParam], cfg) ?? "PENDING (status value not recognised)",
      transactionId: params[cfg.callbackTxnIdParam] ?? null,
      vendorRefId: cfg.callbackVendorRefParam ? params[cfg.callbackVendorRefParam] ?? null : null,
      providerRefId: cfg.callbackOpRefParam ? params[cfg.callbackOpRefParam] ?? null : null,
      message: cfg.callbackMessageParam ? params[cfg.callbackMessageParam] ?? null : null,
    });
    return;
  }

  const fields =
    kind === "STATUS_CHECK"
      ? {
          statusField: cfg.statusCheckStatusField || cfg.statusField,
          opRefField: cfg.statusCheckOpRefField || cfg.opRefField,
          vendorRefField: cfg.vendorRefField,
          messageField: cfg.messageField,
        }
      : { statusField: cfg.statusField, opRefField: cfg.opRefField, vendorRefField: cfg.vendorRefField, messageField: cfg.messageField };
  const reply = parseReply(sample, cfg, fields);
  res.json({
    status: reply.status ?? "PENDING (status value not recognised)",
    providerRefId: reply.providerRefId,
    vendorRefId: reply.vendorRefId,
    message: reply.message,
    parsedAsJson: reply.json !== undefined,
  });
});

// Recent vendor traffic for this provider — the "API logs" view.
providersRouter.get("/:id/logs", async (req, res) => {
  const kind = typeof req.query.kind === "string" && req.query.kind ? req.query.kind : undefined;
  const logs = await prisma.providerCallLog.findMany({
    where: { apiProviderId: String(req.params.id), ...(kind ? { kind } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Number(req.query.limit) || 50),
  });
  res.json({ logs });
});

const createProviderSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).toUpperCase(),
  providerType: z.enum(["RECHARGE", "AEPS", "DMT", "BBPS"]),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
  rentAmount: z.number().min(0).optional(),
  smsAlertOnSuccess: z.boolean().optional(),
  smsAlertOnFailure: z.boolean().optional(),
  retryCount: z.number().int().min(1).max(5).optional(),
  gstPercent: z.number().min(0).max(100).optional(),
});

providersRouter.post("/", async (req, res) => {
  const parsed = createProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const existing = await prisma.apiProvider.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    throw new HttpError(409, "Provider code already exists");
  }
  const provider = await prisma.apiProvider.create({ data: parsed.data });
  res.status(201).json({ provider: { ...provider, apiKey: maskKey(provider.apiKey), apiSecret: "********", httpConfig: undefined, callbackToken: undefined } });
});

const updateProviderSchema = z.object({
  isActive: z.boolean().optional(),
  name: z.string().min(2).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  apiSecret: z.string().min(1).optional(),
  rentAmount: z.number().min(0).optional(),
  smsAlertOnSuccess: z.boolean().optional(),
  smsAlertOnFailure: z.boolean().optional(),
  retryCount: z.number().int().min(1).max(5).optional(),
  gstPercent: z.number().min(0).max(100).optional(),
});

providersRouter.patch("/:id", async (req, res) => {
  const parsed = updateProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const before = await prisma.apiProvider.findUnique({ where: { id: String(req.params.id) } });
  const provider = await prisma.apiProvider
    .update({ where: { id: req.params.id }, data: parsed.data, omit: { httpConfig: true, callbackToken: true } })
    .catch(() => null);
  if (!provider) {
    throw new HttpError(404, "Provider not found");
  }
  if (before && parsed.data.rentAmount !== undefined && Number(before.rentAmount) !== parsed.data.rentAmount) {
    await logActivity(req, "RENT_AMOUNT_UPDATED", {
      userId: req.user!.userId,
      details: `${provider.name}: ₹${before.rentAmount} → ₹${parsed.data.rentAmount}`,
    });
  }
  res.json({ provider: { ...provider, apiKey: maskKey(provider.apiKey), apiSecret: "********" } });
});

// Deducts a provider's periodic subscription/rent cost from the root admin's
// wallet — mirrors AP Money's "Debit Rent" between the platform and its
// upstream vendors.
providersRouter.post("/:id/debit-rent", async (req, res) => {
  const provider = await prisma.apiProvider.findUnique({ where: { id: String(req.params.id) } });
  if (!provider) {
    throw new HttpError(404, "Provider not found");
  }
  if (Number(provider.rentAmount) <= 0) {
    throw new HttpError(400, "This provider has no rent amount configured");
  }

  const admin = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
  if (admin.parentId !== null) {
    throw new HttpError(403, "Only the root admin's wallet is debited for rent");
  }

  const gstAmount = Number(provider.rentAmount) * (Number(provider.gstPercent) / 100);
  const totalDebit = Math.round((Number(provider.rentAmount) + gstAmount) * 100) / 100;

  const wallet = await prisma.$transaction(async (tx) => {
    const updated = await tx.wallet.update({
      where: { userId: admin.id },
      data: { balance: { decrement: totalDebit } },
    });
    await tx.ledgerEntry.create({
      data: {
        walletId: updated.id,
        type: "DEBIT",
        amount: totalDebit,
        balanceAfter: updated.balance,
        referenceType: "RENT",
        referenceId: provider.id,
        description:
          gstAmount > 0
            ? `Rent debited for ${provider.name} (₹${provider.rentAmount} + ${provider.gstPercent}% GST)`
            : `Rent debited for ${provider.name}`,
      },
    });
    return updated;
  });

  res.json({ balance: wallet.balance });
});

providersRouter.get("/rent-report", async (req, res) => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
  const wallet = await prisma.wallet.findUnique({ where: { userId: admin.id } });
  if (!wallet) {
    throw new HttpError(404, "Wallet not found");
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: { walletId: wallet.id, referenceType: "RENT" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const providerIds = [...new Set(entries.map((e) => e.referenceId).filter((id): id is string => Boolean(id)))];
  const providers = await prisma.apiProvider.findMany({ where: { id: { in: providerIds } }, select: PROVIDER_PUBLIC_SELECT });
  const providerMap = new Map(providers.map((p) => [p.id, p]));

  // Optional providerType filter (e.g. AEPS/DMT only) — same unified rent ledger,
  // just scoped, instead of maintaining a separate parallel "SMDA" report.
  const typeFilter = req.query.providerType;
  const filteredEntries =
    typeof typeFilter === "string" && typeFilter.trim()
      ? entries.filter((e) => e.referenceId && providerMap.get(e.referenceId)?.providerType === typeFilter)
      : entries;

  res.json({
    entries: filteredEntries.map((e) => ({
      ...e,
      provider: e.referenceId ? providerMap.get(e.referenceId) : null,
    })),
  });
});

const topupSchema = z.object({
  walletSlot: z.union([z.literal(1), z.literal(2)]),
  amount: z.number().positive(),
  description: z.string().optional(),
});

// Admin sends real money to a vendor (bank transfer, etc.) and records it here —
// debits the root admin's own wallet, credits the provider's float.
providersRouter.post("/:id/topup-wallet", async (req, res) => {
  const parsed = topupSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const provider = await prisma.apiProvider.findUnique({ where: { id: String(req.params.id) } });
  if (!provider) {
    throw new HttpError(404, "Provider not found");
  }
  const admin = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
  if (admin.parentId !== null) {
    throw new HttpError(403, "Only the root admin can fund provider wallets");
  }

  const { walletSlot, amount, description } = parsed.data;
  const balanceField = walletSlot === 1 ? "walletBalance" : "secondaryWalletBalance";

  const result = await prisma.$transaction(async (tx) => {
    const adminWallet = await tx.wallet.update({
      where: { userId: admin.id },
      data: { balance: { decrement: amount } },
    });
    if (adminWallet.balance.lessThan(0)) {
      throw new HttpError(400, "Insufficient balance");
    }
    await tx.ledgerEntry.create({
      data: {
        walletId: adminWallet.id,
        type: "DEBIT",
        amount,
        balanceAfter: adminWallet.balance,
        referenceType: "ADJUSTMENT",
        referenceId: provider.id,
        description: `Funded ${provider.name} ${walletSlot === 1 ? "Wallet 1" : provider.secondaryWalletLabel}${description ? `: ${description}` : ""}`,
      },
    });

    const updatedProvider = await tx.apiProvider.update({
      where: { id: provider.id },
      data: { [balanceField]: { increment: amount } },
    });
    await tx.providerWalletEntry.create({
      data: {
        apiProviderId: provider.id,
        walletSlot,
        type: "CREDIT",
        amount,
        balanceAfter: walletSlot === 1 ? updatedProvider.walletBalance : updatedProvider.secondaryWalletBalance,
        description: description || "Manual top-up",
      },
    });
    return updatedProvider;
  });

  res.json({ provider: { id: result.id, name: result.name, walletBalance: result.walletBalance, secondaryWalletBalance: result.secondaryWalletBalance } });
});

providersRouter.get("/:id/wallet-report", async (req, res) => {
  const entries = await prisma.providerWalletEntry.findMany({
    where: { apiProviderId: String(req.params.id) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ entries });
});

// Audit trail of rentAmount edits — mirrors AP Money's "Report Rent Update".
providersRouter.get("/rent-update-report", async (_req, res) => {
  const logs = await prisma.activityLog.findMany({
    where: { action: "RENT_AMOUNT_UPDATED" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const userIds = [...new Set(logs.map((l) => l.userId).filter((id): id is string => Boolean(id)))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, phone: true } });
  const userMap = new Map(users.map((u) => [u.id, u]));
  res.json({
    logs: logs.map((l) => ({ ...l, user: l.userId ? (userMap.get(l.userId) ?? null) : null })),
  });
});
