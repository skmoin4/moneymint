import { Router } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { signToken } from "../utils/jwt";
import { authenticate } from "../middleware/auth";
import { logActivity } from "../utils/activityLog";
import { isIpAllowedForAdmin } from "../middleware/ipWhitelist";
import { sendSms } from "../services/smsService";
import { HttpError } from "../utils/httpError";
import { generateReferralCode } from "../utils/referral";
import { authLimiter } from "../middleware/rateLimiters";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10).max(15),
  email: z.string().email().optional(),
  password: z.string().min(6),
});

// Bootstrap-only: creates the very first ADMIN account for a fresh deployment.
// Once an ADMIN exists, this closes — all further users must be created via
// the authenticated, hierarchy-checked POST /users endpoint.
authRouter.post("/register", authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, phone, email, password } = parsed.data;

  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (existingAdmin) {
    return res
      .status(403)
      .json({ error: "Registration is closed. Contact your administrator for an account." });
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return res.status(409).json({ error: "Phone already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const referralCode = await generateReferralCode();

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: { name, phone, email, passwordHash, role: "ADMIN", referralCode },
    });
    await tx.wallet.create({
      data: { userId: createdUser.id, balance: 0 },
    });
    return createdUser;
  });

  const token = signToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });
  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
  });
});

const loginSchema = z.object({
  phone: z.string().min(10).max(15),
  password: z.string().min(6),
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { phone, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    await logActivity(req, "LOGIN_FAILED", { details: `Unknown phone: ${phone}` });
    return res.status(401).json({ error: "Invalid phone or password" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await logActivity(req, "LOGIN_FAILED", { userId: user.id, details: "Wrong password" });
    return res.status(401).json({ error: "Invalid phone or password" });
  }
  if (user.status !== "ACTIVE") {
    await logActivity(req, "LOGIN_FAILED", { userId: user.id, details: `Account ${user.status}` });
    return res.status(403).json({ error: `Your account is ${user.status.toLowerCase()}. Contact your distributor.` });
  }

  // Only the admin-panel login is ever subject to IP restriction — the retailer/consumer
  // app logs in from cell networks nationwide and must never be geo-restricted.
  if (user.role === "ADMIN") {
    const { allowed, ip } = await isIpAllowedForAdmin(req);
    if (!allowed) {
      await logActivity(req, "LOGIN_FAILED", { userId: user.id, details: `Blocked IP: ${ip}` });
      return res.status(403).json({ error: `Access denied from this IP address (${ip}).` });
    }
  }

  await logActivity(req, "LOGIN_SUCCESS", { userId: user.id });

  const token = signToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });
  res.json({
    token,
    user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
  });
});

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUEST_COOLDOWN_SECONDS = 45;

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

const otpRequestSchema = z.object({ phone: z.string().min(10).max(15) });

// Consumer-app login channel: mobile number + OTP, no password. Distinct from the
// admin panel's phone+password login, but issues the same kind of session token —
// the app and the admin panel are two clients of the same account system.
authRouter.post("/otp/request", authLimiter, async (req, res) => {
  const parsed = otpRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const { phone } = parsed.data;

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    throw new HttpError(404, "This phone number isn't registered. Contact your distributor for an account.");
  }
  if (user.status !== "ACTIVE") {
    throw new HttpError(403, `Your account is ${user.status.toLowerCase()}. Contact your distributor.`);
  }

  const recent = await prisma.otpRequest.findFirst({
    where: { phone, createdAt: { gte: new Date(Date.now() - OTP_REQUEST_COOLDOWN_SECONDS * 1000) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    throw new HttpError(429, `Please wait before requesting another OTP.`);
  }

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  await prisma.otpRequest.create({
    data: {
      phone,
      otpHash,
      purpose: "LOGIN",
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    },
  });

  await sendSms(phone, `Your MoneyMint login OTP is ${otp}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share this with anyone.`, "OTP");

  res.json({ sent: true, expiresInSeconds: OTP_TTL_MINUTES * 60 });
});

const otpVerifySchema = z.object({ phone: z.string().min(10).max(15), otp: z.string().length(6) });

authRouter.post("/otp/verify", authLimiter, async (req, res) => {
  const parsed = otpVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const { phone, otp } = parsed.data;

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    return res.status(401).json({ error: "Invalid phone number or OTP" });
  }

  const otpRequest = await prisma.otpRequest.findFirst({
    where: { phone, purpose: "LOGIN", consumed: false, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otpRequest || otpRequest.attempts >= OTP_MAX_ATTEMPTS) {
    await logActivity(req, "LOGIN_FAILED", { userId: user.id, details: "OTP expired or too many attempts" });
    return res.status(401).json({ error: "OTP expired or invalid. Please request a new one." });
  }

  const valid = await bcrypt.compare(otp, otpRequest.otpHash);
  if (!valid) {
    await prisma.otpRequest.update({ where: { id: otpRequest.id }, data: { attempts: { increment: 1 } } });
    await logActivity(req, "LOGIN_FAILED", { userId: user.id, details: "Wrong OTP" });
    return res.status(401).json({ error: "Invalid phone number or OTP" });
  }

  if (user.role === "ADMIN") {
    const { allowed, ip } = await isIpAllowedForAdmin(req);
    if (!allowed) {
      await logActivity(req, "LOGIN_FAILED", { userId: user.id, details: `Blocked IP: ${ip}` });
      return res.status(403).json({ error: `Access denied from this IP address (${ip}).` });
    }
  }

  await prisma.otpRequest.update({ where: { id: otpRequest.id }, data: { consumed: true } });
  await logActivity(req, "LOGIN_SUCCESS", { userId: user.id, details: "via OTP" });

  const token = signToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });
  res.json({
    token,
    user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
  });
});

// Forgot Password — same OTP machinery as login, just a different `purpose` so a
// password-reset OTP can never be replayed to log in (or vice versa) and doesn't
// share the 45s cooldown/attempt-counter with an in-flight login OTP.
authRouter.post("/password/reset-request", authLimiter, async (req, res) => {
  const parsed = otpRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const { phone } = parsed.data;

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    // Don't reveal whether the phone is registered — respond the same either way.
    return res.json({ sent: true, expiresInSeconds: OTP_TTL_MINUTES * 60 });
  }

  const recent = await prisma.otpRequest.findFirst({
    where: {
      phone,
      purpose: "PASSWORD_RESET",
      createdAt: { gte: new Date(Date.now() - OTP_REQUEST_COOLDOWN_SECONDS * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    throw new HttpError(429, "Please wait before requesting another OTP.");
  }

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  await prisma.otpRequest.create({
    data: { phone, otpHash, purpose: "PASSWORD_RESET", expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000) },
  });

  await sendSms(
    phone,
    `Your MoneyMint password reset OTP is ${otp}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share this with anyone.`,
    "OTP"
  );

  res.json({ sent: true, expiresInSeconds: OTP_TTL_MINUTES * 60 });
});

const passwordResetSchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6),
  newPassword: z.string().min(6),
});

authRouter.post("/password/reset", authLimiter, async (req, res) => {
  const parsed = passwordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const { phone, otp, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    return res.status(401).json({ error: "Invalid phone number or OTP" });
  }

  const otpRequest = await prisma.otpRequest.findFirst({
    where: { phone, purpose: "PASSWORD_RESET", consumed: false, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otpRequest || otpRequest.attempts >= OTP_MAX_ATTEMPTS) {
    return res.status(401).json({ error: "OTP expired or invalid. Please request a new one." });
  }

  const valid = await bcrypt.compare(otp, otpRequest.otpHash);
  if (!valid) {
    await prisma.otpRequest.update({ where: { id: otpRequest.id }, data: { attempts: { increment: 1 } } });
    return res.status(401).json({ error: "Invalid phone number or OTP" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.otpRequest.update({ where: { id: otpRequest.id }, data: { consumed: true } }),
    // Bump tokenVersion so every session logged in under the old (possibly
    // compromised) password is instantly invalidated by the reset.
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 } } }),
  ]);
  await logActivity(req, "PASSWORD_RESET", { userId: user.id });

  res.json({ ok: true });
});

// "Logout All Devices" — bumping tokenVersion instantly invalidates every JWT issued
// before this call, across every device that was logged in.
authRouter.post("/logout-all", authenticate, async (req, res) => {
  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { tokenVersion: { increment: 1 } },
  });
  await logActivity(req, "LOGOUT_ALL_DEVICES", { userId: req.user!.userId });
  res.json({ ok: true });
});

// "Last Login Device History" — every login already writes an ActivityLog row with the
// requesting IP + user-agent (see logActivity calls above); this just surfaces that
// existing trail rather than needing a separate device-tracking table.
authRouter.get("/login-history", authenticate, async (req, res) => {
  const entries = await prisma.activityLog.findMany({
    where: { userId: req.user!.userId, action: "LOGIN_SUCCESS" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { ipAddress: true, userAgent: true, details: true, createdAt: true },
  });
  res.json({ entries });
});

authRouter.get("/pin/status", authenticate, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.userId },
    select: { transactionPinHash: true, pinEnabled: true },
  });
  res.json({ hasPin: user.transactionPinHash !== null, pinEnabled: user.pinEnabled });
});

const setPinSchema = z.object({ pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4-6 digits") });

authRouter.post("/pin/set", authenticate, async (req, res) => {
  const parsed = setPinSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const transactionPinHash = await bcrypt.hash(parsed.data.pin, 10);
  await prisma.user.update({ where: { id: req.user!.userId }, data: { transactionPinHash } });
  await logActivity(req, "PIN_SET", { userId: req.user!.userId });
  res.json({ ok: true });
});

const togglePinSchema = z.object({ enabled: z.boolean() });

authRouter.post("/pin/toggle", authenticate, async (req, res) => {
  const parsed = togglePinSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
  if (parsed.data.enabled && !user.transactionPinHash) {
    throw new HttpError(400, "Set a PIN before enabling it");
  }
  await prisma.user.update({ where: { id: user.id }, data: { pinEnabled: parsed.data.enabled } });
  res.json({ pinEnabled: parsed.data.enabled });
});

authRouter.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { wallet: true },
  });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    walletBalance: user.wallet?.balance,
  });
});
