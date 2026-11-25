import type { Prisma, CommissionSlab } from "../generated/prisma/client";

type Tx = Prisma.TransactionClient;

interface PackLike {
  globalCommissionType: "PERCENT" | "FLAT" | null;
  globalValue: Prisma.Decimal | null;
  slabs: CommissionSlab[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function rupees(type: "PERCENT" | "FLAT", value: number, amount: number) {
  return round2(type === "PERCENT" ? (amount * value) / 100 : value);
}

/**
 * A pack's rate for one operator at one amount, in rupees: positive = commission paid to
 * the user, negative = surcharge charged to the user, null = this pack sets no rate.
 * Among slabs whose amount range contains the amount, the narrowest range wins, so a
 * specific "₹1001–5000" slab beats a catch-all one.
 */
export function resolveRate(pack: PackLike | null | undefined, operatorId: string, amount: number): number | null {
  if (!pack) return null;
  const matching = pack.slabs.filter(
    (s) =>
      s.operatorId === operatorId &&
      (s.minAmount === null || amount >= Number(s.minAmount)) &&
      (s.maxAmount === null || amount <= Number(s.maxAmount))
  );
  if (matching.length > 0) {
    const width = (s: CommissionSlab) =>
      s.minAmount === null || s.maxAmount === null ? Number.POSITIVE_INFINITY : Number(s.maxAmount) - Number(s.minAmount);
    const slab = matching.sort((a, b) => width(a) - width(b))[0];
    const value = rupees(slab.commissionType, Number(slab.value), amount);
    return slab.chargeType === "SURCHARGE" ? -value : value;
  }
  if (pack.globalCommissionType && pack.globalValue !== null) {
    return rupees(pack.globalCommissionType, Number(pack.globalValue), amount);
  }
  return null;
}

async function loadUserWithPack(tx: Tx, userId: string, operatorId: string) {
  return tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      role: true,
      parentId: true,
      commissionPack: {
        select: { globalCommissionType: true, globalValue: true, slabs: { where: { operatorId } } },
      },
    },
  });
}

/** The transacting user's own rate — used before debiting, to add any surcharge. */
export async function userRate(tx: Tx, userId: string, operatorId: string, amount: number) {
  const user = await loadUserWithPack(tx, userId, operatorId);
  return resolveRate(user?.commissionPack, operatorId, amount);
}

/** What the vendor pays the platform on this transaction, from the operator↔API mapping. */
export async function vendorMargin(tx: Tx, operatorId: string, apiProviderId: string, amount: number) {
  const mapping = await tx.operatorApiMapping.findFirst({
    where: { operatorId, apiProviderId },
    select: { vendorCommissionType: true, vendorCommissionValue: true },
  });
  if (!mapping?.vendorCommissionType || mapping.vendorCommissionValue === null) return 0;
  return rupees(mapping.vendorCommissionType, Number(mapping.vendorCommissionValue), amount);
}

const MAX_LEVELS = 10;

/**
 * Pays commission up the hierarchy for a successful transaction (differential model):
 *  - the user earns their own rate (if it is a commission, not a surcharge);
 *  - each upline below ADMIN earns (its own rate − the best rate below it), never less
 *    than zero, so an upline with a richer pack than its downline keeps the difference;
 *  - an upline with no rate for this operator earns nothing and is skipped;
 *  - the platform (ADMIN) keeps vendor margin + surcharge − everything paid out.
 * TDS (setting "commissionTdsPercent") is withheld from each payout. Returns the user's
 * own gross commission.
 */
export async function distributeCommission(
  tx: Tx,
  params: { transactionId: string; userId: string; operatorId: string; amount: number; label: string; identifier: string }
): Promise<number> {
  const { transactionId, userId, operatorId, amount, label, identifier } = params;
  const tdsSetting = await tx.systemSetting.findUnique({ where: { key: "commissionTdsPercent" } });
  const tdsPercent = Math.max(0, Math.min(100, Number(tdsSetting?.value ?? 0) || 0));

  const user = await loadUserWithPack(tx, userId, operatorId);
  if (!user) return 0;

  const payouts: { id: string; name: string; role: (typeof user)["role"]; level: number; gross: number }[] = [];
  const ownRate = resolveRate(user.commissionPack, operatorId, amount);
  if (ownRate !== null && ownRate > 0) payouts.push({ id: user.id, name: user.name, role: user.role, level: 0, gross: ownRate });

  let floor = ownRate ?? 0;
  let parentId = user.parentId;
  for (let level = 1; parentId && level <= MAX_LEVELS; level++) {
    const upline = await loadUserWithPack(tx, parentId, operatorId);
    if (!upline || upline.role === "ADMIN") break;
    const rate = resolveRate(upline.commissionPack, operatorId, amount);
    if (rate !== null) {
      const earn = round2(rate - floor);
      if (earn > 0) payouts.push({ id: upline.id, name: upline.name, role: upline.role, level, gross: earn });
      floor = Math.max(floor, rate);
    }
    parentId = upline.parentId;
  }

  for (const p of payouts) {
    const tds = round2((p.gross * tdsPercent) / 100);
    const net = round2(p.gross - tds);
    if (net > 0) {
      const wallet = await tx.wallet.update({ where: { userId: p.id }, data: { balance: { increment: net } } });
      const tdsNote = tds > 0 ? ` — ₹${p.gross} less TDS ₹${tds}` : "";
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: "CREDIT",
          amount: net,
          balanceAfter: wallet.balance,
          referenceType: "COMMISSION",
          referenceId: transactionId,
          description:
            p.level === 0
              ? `Commission for ${label.toLowerCase()} (${identifier})${tdsNote}`
              : `Margin from ${user.name}'s ${label.toLowerCase()} of ₹${amount} (${identifier})${tdsNote}`,
        },
      });
    }
    await tx.commissionPayout.create({
      data: { transactionId, userId: p.id, level: p.level, role: p.role, gross: p.gross, tds, net },
    });
  }

  return payouts.find((p) => p.level === 0)?.gross ?? 0;
}
