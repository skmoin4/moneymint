import { Router } from "express";
import crypto from "crypto";
import net from "net";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { logActivity } from "../utils/activityLog";
import { assertPublicHttpUrl } from "../utils/safeUrl";
import { hashToken } from "./partnerApi";
import { signPayload } from "../services/partnerCallbacks";

// Panel side of the partner API: the admin turns API access on/off per user ("API
// Users"); the user manages their own token, whitelisted IPs and callback ("API Token &
// Callback").
export const apiAccessRouter = Router();

apiAccessRouter.use(authenticate);

const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
const newSecret = () => crypto.randomBytes(24).toString("hex");

// ---- Admin ------------------------------------------------------------------------

apiAccessRouter.get("/users", authorize("ADMIN"), async (_req, res) => {
  const creds = await prisma.apiCredential.findMany({
    include: { user: { select: { id: true, name: true, phone: true, role: true, status: true, wallet: { select: { balance: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = await prisma.transaction.groupBy({
    by: ["userId", "status"],
    where: { source: "API", createdAt: { gte: start }, userId: { in: creds.map((c) => c.userId) } },
    _count: { _all: true },
    _sum: { amount: true },
  });
  res.json({
    users: creds.map((c) => {
      const mine = today.filter((t) => t.userId === c.userId);
      return {
        userId: c.userId,
        name: c.user.name,
        phone: c.user.phone,
        role: c.user.role,
        userStatus: c.user.status,
        balance: Number(c.user.wallet?.balance ?? 0),
        isActive: c.isActive,
        hasToken: Boolean(c.tokenHash),
        tokenPrefix: c.tokenPrefix,
        allowedIps: c.allowedIps,
        callbackUrl: c.callbackUrl,
        lastUsedAt: c.lastUsedAt,
        today: {
          count: mine.reduce((s, t) => s + t._count._all, 0),
          success: Number(mine.find((t) => t.status === "SUCCESS")?._sum.amount ?? 0),
        },
      };
    }),
  });
});

// Users that could be given API access (search by name or mobile, whole platform).
apiAccessRouter.get("/candidates", authorize("ADMIN"), async (req, res) => {
  const q = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (q.length < 2) {
    res.json({ users: [] });
    return;
  }
  const users = await prisma.user.findMany({
    where: { role: { not: "ADMIN" }, OR: [{ phone: { contains: q } }, { name: { contains: q, mode: "insensitive" } }] },
    select: { id: true, name: true, phone: true, role: true, apiCredential: { select: { isActive: true } } },
    take: 10,
    orderBy: { name: "asc" },
  });
  res.json({ users });
});

const enableSchema = z.object({ userId: z.string().uuid() });

apiAccessRouter.post("/users", authorize("ADMIN"), async (req, res) => {
  const parsed = enableSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user || user.role === "ADMIN") throw new HttpError(404, "User not found");
  const cred = await prisma.apiCredential.upsert({
    where: { userId: user.id },
    update: { isActive: true },
    create: { userId: user.id, callbackSecret: newSecret() },
  });
  await logActivity(req, "API_ACCESS_ENABLED", { userId: req.user!.userId, details: `${user.name} (${user.phone})` });
  res.status(201).json({ credential: { userId: cred.userId, isActive: cred.isActive } });
});

apiAccessRouter.patch("/users/:userId", authorize("ADMIN"), async (req, res) => {
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const cred = await prisma.apiCredential
    .update({ where: { userId: String(req.params.userId) }, data: { isActive: parsed.data.isActive } })
    .catch(() => null);
  if (!cred) throw new HttpError(404, "This user has no API access");
  await logActivity(req, parsed.data.isActive ? "API_ACCESS_ENABLED" : "API_ACCESS_DISABLED", {
    userId: req.user!.userId,
    details: cred.userId,
  });
  res.json({ credential: { userId: cred.userId, isActive: cred.isActive } });
});

// ---- The API user themself --------------------------------------------------------

async function myCredential(userId: string) {
  const cred = await prisma.apiCredential.findUnique({ where: { userId } });
  if (!cred) throw new HttpError(404, "API access is not enabled for your account. Contact the administrator.");
  return cred;
}

apiAccessRouter.get("/me", async (req, res) => {
  const cred = await prisma.apiCredential.findUnique({ where: { userId: req.user!.userId } });
  if (!cred) {
    res.json({ enabled: false });
    return;
  }
  res.json({
    enabled: true,
    isActive: cred.isActive,
    hasToken: Boolean(cred.tokenHash),
    tokenPrefix: cred.tokenPrefix,
    allowedIps: cred.allowedIps,
    callbackUrl: cred.callbackUrl,
    callbackMethod: cred.callbackMethod,
    callbackSecret: cred.callbackSecret,
    lastUsedAt: cred.lastUsedAt,
    baseUrl: `${PUBLIC_API_URL}/api/v1`,
  });
});

// Generates (or replaces) the token. Shown once — only its hash is kept.
apiAccessRouter.post("/me/token", async (req, res) => {
  await myCredential(req.user!.userId);
  const token = `mm_live_${crypto.randomBytes(24).toString("hex")}`;
  await prisma.apiCredential.update({
    where: { userId: req.user!.userId },
    data: { tokenHash: hashToken(token), tokenPrefix: token.slice(0, 14) },
  });
  await logActivity(req, "API_TOKEN_GENERATED", { userId: req.user!.userId });
  res.json({ token });
});

const settingsSchema = z.object({
  allowedIps: z.string().max(500),
  callbackUrl: z.string().max(500).nullable(),
  callbackMethod: z.enum(["POST", "GET"]),
});

apiAccessRouter.put("/me", async (req, res) => {
  await myCredential(req.user!.userId);
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  const ips = parsed.data.allowedIps
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  const bad = ips.find((ip) => !net.isIP(ip));
  if (bad) throw new HttpError(400, `"${bad}" is not a valid IP address`);
  if (ips.length > 10) throw new HttpError(400, "At most 10 IPs");
  const callbackUrl = parsed.data.callbackUrl?.trim() || null;
  if (callbackUrl) {
    const problem = await assertPublicHttpUrl(callbackUrl);
    if (problem) throw new HttpError(400, `Callback URL: ${problem}`);
  }
  await prisma.apiCredential.update({
    where: { userId: req.user!.userId },
    data: { allowedIps: [...new Set(ips)].join(","), callbackUrl, callbackMethod: parsed.data.callbackMethod },
  });
  await logActivity(req, "API_SETTINGS_UPDATED", { userId: req.user!.userId, details: `IPs: ${ips.join(",") || "none"}` });
  res.json({ ok: true });
});

apiAccessRouter.post("/me/callback-secret", async (req, res) => {
  await myCredential(req.user!.userId);
  const cred = await prisma.apiCredential.update({ where: { userId: req.user!.userId }, data: { callbackSecret: newSecret() } });
  res.json({ callbackSecret: cred.callbackSecret });
});

apiAccessRouter.get("/me/callbacks", async (req, res) => {
  const callbacks = await prisma.partnerCallback.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ callbacks });
});

apiAccessRouter.post("/me/callbacks/:id/resend", async (req, res) => {
  const cb = await prisma.partnerCallback.findFirst({ where: { id: String(req.params.id), userId: req.user!.userId } });
  if (!cb) throw new HttpError(404, "Callback not found");
  const cred = await myCredential(req.user!.userId);
  await prisma.partnerCallback.update({
    where: { id: cb.id },
    // Re-sent to the current URL/method, in case the partner fixed them.
    data: { status: "PENDING", nextAttemptAt: new Date(), url: cred.callbackUrl ?? cb.url, method: cred.callbackMethod, attempts: 0 },
  });
  res.json({ ok: true });
});

// Sends a sample callback right now and reports what the partner's server answered.
apiAccessRouter.post("/me/test-callback", async (req, res) => {
  const cred = await myCredential(req.user!.userId);
  if (!cred.callbackUrl) throw new HttpError(400, "Set a callback URL first");
  const problem = await assertPublicHttpUrl(cred.callbackUrl);
  if (problem) throw new HttpError(400, `Callback URL: ${problem}`);
  const payload = {
    status: "SUCCESS",
    txn_id: "TEST-0000",
    client_ref: "TEST",
    number: "9999999999",
    operator: "JIO",
    amount: 10,
    operator_ref: "TEST",
    message: "Test callback",
    time: new Date().toISOString(),
  };
  const body = JSON.stringify(payload);
  try {
    let r: Response;
    if (cred.callbackMethod === "GET") {
      const params = new URLSearchParams(Object.entries(payload).map(([k, v]) => [k, String(v)]));
      params.set("signature", signPayload(cred.callbackSecret, params.toString()));
      r = await fetch(`${cred.callbackUrl}${cred.callbackUrl.includes("?") ? "&" : "?"}${params}`, { signal: AbortSignal.timeout(10_000) });
    } else {
      r = await fetch(cred.callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-MoneyMint-Signature": signPayload(cred.callbackSecret, body) },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    }
    const text = (await r.text()).slice(0, 300);
    res.json({ ok: r.ok, httpStatus: r.status, response: text });
  } catch (err) {
    res.json({ ok: false, httpStatus: null, response: (err as Error).message });
  }
});
