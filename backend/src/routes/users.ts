import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { logActivity } from "../utils/activityLog";
import { generateReferralCode } from "../utils/referral";
import { getDescendantUserIds } from "../utils/hierarchy";

export const usersRouter = Router();

usersRouter.use(authenticate);

const ROLE_ORDER = ["ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR", "RETAILER"] as const;

usersRouter.get("/", async (req, res) => {
  const search = req.query.search;
  const where: Record<string, unknown> = { parentId: req.user!.userId };
  if (typeof search === "string" && search.trim()) {
    where.OR = [
      { name: { contains: search.trim(), mode: "insensitive" } },
      { phone: { contains: search.trim(), mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    include: { wallet: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email,
      role: u.role,
      status: u.status,
      walletBalance: u.wallet?.balance,
      commissionPackId: u.commissionPackId,
      referralCode: u.referralCode,
      createdAt: u.createdAt,
    })),
  });
});

const createUserSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10).max(15),
  email: z.string().email().optional(),
  password: z.string().min(6),
  role: z.enum(["MASTER_DISTRIBUTOR", "DISTRIBUTOR", "RETAILER"]),
  referredByCode: z.string().optional(),
});

usersRouter.post(
  "/",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
    }
    const { name, phone, email, password, role, referredByCode } = parsed.data;

    const creatorRole = req.user!.role;
    const creatorIdx = ROLE_ORDER.indexOf(creatorRole as (typeof ROLE_ORDER)[number]);
    const newRoleIdx = ROLE_ORDER.indexOf(role);
    if (newRoleIdx <= creatorIdx) {
      throw new HttpError(403, "You can only create users below your own role");
    }

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new HttpError(409, "Phone already registered");
    }

    let referredById: string | null = null;
    if (referredByCode) {
      const referrer = await prisma.user.findUnique({ where: { referralCode: referredByCode.toUpperCase() } });
      if (!referrer) {
        throw new HttpError(400, "Invalid referral code");
      }
      referredById = referrer.id;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const referralCode = await generateReferralCode();

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name,
          phone,
          email,
          passwordHash,
          role,
          parentId: req.user!.userId,
          referralCode,
          referredById,
        },
      });
      await tx.wallet.create({
        data: { userId: createdUser.id, balance: 0 },
      });
      return createdUser;
    });

    await logActivity(req, "USER_CREATED", {
      userId: req.user!.userId,
      details: `Created ${user.role} ${user.name} (${user.phone})`,
    });

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        referralCode: user.referralCode,
      },
    });
  }
);

// "Refer Friends" screen: my code, who I've referred, and total reward earned so far.
usersRouter.get("/my-referrals", async (req, res) => {
  const [me, referredUsers, wallet] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId }, select: { referralCode: true } }),
    prisma.user.findMany({
      where: { referredById: req.user!.userId },
      select: { id: true, name: true, phone: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.wallet.findUnique({ where: { userId: req.user!.userId } }),
  ]);

  const totalEarned = wallet
    ? await prisma.ledgerEntry.aggregate({
        where: { walletId: wallet.id, referenceType: "REFERRAL_REWARD" },
        _sum: { amount: true },
      })
    : null;

  res.json({
    referralCode: me.referralCode,
    referredUsers,
    totalEarned: totalEarned?._sum.amount ?? 0,
  });
});

const assignCommissionSchema = z.object({
  commissionPackId: z.string().uuid().nullable(),
});

usersRouter.patch(
  "/:id/commission",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const parsed = assignCommissionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
    }

    const target = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
    if (!target || target.parentId !== req.user!.userId) {
      throw new HttpError(403, "You can only manage users in your own downline");
    }

    const updated = await prisma.user.update({
      where: { id: String(req.params.id) },
      data: { commissionPackId: parsed.data.commissionPackId },
    });

    res.json({ user: { id: updated.id, commissionPackId: updated.commissionPackId } });
  }
);

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

// Activate / deactivate / suspend an account anywhere in the caller's downline. Takes
// effect immediately: the auth middleware rejects every request from a non-ACTIVE user.
usersRouter.patch(
  "/:id/status",
  authorize("ADMIN", "MASTER_DISTRIBUTOR", "DISTRIBUTOR"),
  async (req, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
    }
    const targetId = String(req.params.id);
    if (targetId === req.user!.userId) {
      throw new HttpError(400, "You can't change your own status");
    }
    const descendants = await getDescendantUserIds(req.user!.userId);
    if (!descendants.includes(targetId)) {
      throw new HttpError(403, "You can only manage users in your own downline");
    }
    const updated = await prisma.user.update({ where: { id: targetId }, data: { status: parsed.data.status } });
    await logActivity(req, "USER_STATUS_CHANGED", {
      userId: req.user!.userId,
      details: `${updated.name} (${updated.phone}) → ${updated.status}`,
    });
    res.json({ user: { id: updated.id, status: updated.status } });
  }
);
