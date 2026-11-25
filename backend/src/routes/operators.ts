import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { HttpError } from "../utils/httpError";
import { PROVIDER_PUBLIC_SELECT } from "../utils/providerSelect";

export const operatorsRouter = Router();

operatorsRouter.use(authenticate);

operatorsRouter.get("/", async (req, res) => {
  const withMappings = req.query.withMappings === "1" && req.user!.role === "ADMIN";
  // Consumer-facing flows (recharge/BBPS/DMT/AEPS forms) pass activeOnly=1 so a
  // disabled operator never appears as a selectable option in the app.
  const activeOnly = req.query.activeOnly === "1";
  const operators = await prisma.operator.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { name: "asc" },
    ...(withMappings
      ? { include: { apiMappings: { include: { apiProvider: { select: PROVIDER_PUBLIC_SELECT } }, orderBy: { priority: "asc" as const } } } }
      : {}),
  });
  res.json({ operators });
});

// Best-guess operator for a mobile number, by longest matching prefix — e.g. the app
// showing the Jio logo as soon as enough digits are typed. Heuristic (numbers can port
// between operators), so the app should still let the user confirm/override.
operatorsRouter.get("/detect", async (req, res) => {
  const mobileNumber = String(req.query.mobileNumber || "").replace(/\D/g, "");
  if (mobileNumber.length < 2) {
    return res.json({ operator: null });
  }
  const prefixes = await prisma.operatorPrefix.findMany({ include: { operator: true } });
  let best: (typeof prefixes)[number] | null = null;
  for (const p of prefixes) {
    if (mobileNumber.startsWith(p.prefix) && (!best || p.prefix.length > best.prefix.length)) {
      best = p;
    }
  }
  res.json({ operator: best?.operator ?? null });
});

const upsertPrefixSchema = z.object({
  prefix: z.string().regex(/^\d{1,6}$/, "Prefix must be 1-6 digits"),
  operatorId: z.string().uuid(),
});

operatorsRouter.get("/prefixes", authorize("ADMIN"), async (_req, res) => {
  const prefixes = await prisma.operatorPrefix.findMany({
    include: { operator: true },
    orderBy: { prefix: "asc" },
  });
  res.json({ prefixes });
});

operatorsRouter.post("/prefixes", authorize("ADMIN"), async (req, res) => {
  const parsed = upsertPrefixSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const existing = await prisma.operatorPrefix.findUnique({ where: { prefix: parsed.data.prefix } });
  if (existing) {
    throw new HttpError(409, "This prefix is already mapped to an operator");
  }
  const prefix = await prisma.operatorPrefix.create({ data: parsed.data, include: { operator: true } });
  res.status(201).json({ prefix });
});

operatorsRouter.delete("/prefixes/:id", authorize("ADMIN"), async (req, res) => {
  await prisma.operatorPrefix.delete({ where: { id: String(req.params.id) } }).catch(() => null);
  res.status(204).send();
});

operatorsRouter.get("/:id", authorize("ADMIN"), async (req, res) => {
  const operator = await prisma.operator.findUnique({
    where: { id: String(req.params.id) },
    include: {
      apiMappings: {
        include: { apiProvider: { select: PROVIDER_PUBLIC_SELECT } },
        orderBy: { priority: "asc" },
      },
    },
  });
  if (!operator) {
    throw new HttpError(404, "Operator not found");
  }
  res.json({ operator });
});

const createOperatorSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).toUpperCase(),
  type: z.string().min(2),
});

operatorsRouter.post("/", authorize("ADMIN"), async (req, res) => {
  const parsed = createOperatorSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const existing = await prisma.operator.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    throw new HttpError(409, "Operator code already exists");
  }
  const operator = await prisma.operator.create({ data: parsed.data });
  res.status(201).json({ operator });
});

const toggleOperatorSchema = z.object({ isActive: z.boolean() });

operatorsRouter.patch("/:id", authorize("ADMIN"), async (req, res) => {
  const parsed = toggleOperatorSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const operator = await prisma.operator
    .update({ where: { id: String(req.params.id) }, data: { isActive: parsed.data.isActive } })
    .catch(() => null);
  if (!operator) {
    throw new HttpError(404, "Operator not found");
  }
  res.json({ operator });
});

const bulkStatusSchema = z.object({ isActive: z.boolean() });

// Delete an operator that was never used. Operators with transaction history can only be
// disabled — deleting them would orphan reports and the ledger trail.
operatorsRouter.delete("/:id", authorize("ADMIN"), async (req, res) => {
  const id = String(req.params.id);
  const used = await prisma.transaction.count({ where: { operatorId: id } });
  if (used > 0) {
    throw new HttpError(409, `This operator has ${used} transaction(s) and can't be deleted — disable it instead`);
  }
  await prisma.$transaction([
    prisma.operatorApiMapping.deleteMany({ where: { operatorId: id } }),
    prisma.commissionSlab.deleteMany({ where: { operatorId: id } }),
    prisma.operatorPrefix.deleteMany({ where: { operatorId: id } }),
    prisma.rechargePlan.deleteMany({ where: { operatorId: id } }),
    prisma.cashbackOffer.deleteMany({ where: { operatorId: id } }),
    prisma.operator.delete({ where: { id } }),
  ]);
  res.status(204).send();
});

operatorsRouter.post("/bulk-status", authorize("ADMIN"), async (req, res) => {
  const parsed = bulkStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const result = await prisma.operator.updateMany({ data: { isActive: parsed.data.isActive } });
  res.json({ updated: result.count });
});

const globalApiUpdateSchema = z.object({
  priority: z.number().int().min(1).max(5),
  apiProviderId: z.string().uuid(),
  // Omit to update every operator (the original "Global API Update"); pass a type
  // (e.g. "AEPS") to scope the bulk update to just that provider type instead.
  type: z.string().optional(),
});

operatorsRouter.post("/global-api-update", authorize("ADMIN"), async (req, res) => {
  const parsed = globalApiUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const provider = await prisma.apiProvider.findUnique({ where: { id: parsed.data.apiProviderId } });
  if (!provider) {
    throw new HttpError(404, "Provider not found");
  }
  const operators = await prisma.operator.findMany({
    where: parsed.data.type ? { type: parsed.data.type } : undefined,
    select: { id: true },
  });
  await prisma.$transaction(
    operators.map((op) =>
      prisma.operatorApiMapping.upsert({
        where: { operatorId_priority: { operatorId: op.id, priority: parsed.data.priority } },
        update: { apiProviderId: parsed.data.apiProviderId, isActive: true },
        create: {
          operatorId: op.id,
          priority: parsed.data.priority,
          apiProviderId: parsed.data.apiProviderId,
        },
      })
    )
  );
  res.json({ updated: operators.length });
});

const apiSwitchSchema = z.object({
  fromApiProviderId: z.string().uuid(),
  toApiProviderId: z.string().uuid(),
  // Omit to switch the provider in every slot; pass 1-5 to switch only that slot
  // (the per-slot "Update API N" buttons on the Api to Api Switch row).
  priority: z.number().int().min(1).max(5).optional(),
});

operatorsRouter.post("/api-switch", authorize("ADMIN"), async (req, res) => {
  const parsed = apiSwitchSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  if (parsed.data.fromApiProviderId === parsed.data.toApiProviderId) {
    throw new HttpError(400, "Source and target provider must be different");
  }
  const toProvider = await prisma.apiProvider.findUnique({ where: { id: parsed.data.toApiProviderId } });
  if (!toProvider) {
    throw new HttpError(404, "Target provider not found");
  }
  const result = await prisma.operatorApiMapping.updateMany({
    where: {
      apiProviderId: parsed.data.fromApiProviderId,
      ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
    },
    data: { apiProviderId: parsed.data.toApiProviderId },
  });
  res.json({ updated: result.count });
});

const upsertMappingSchema = z.object({
  priority: z.number().int().min(1).max(5),
  apiProviderId: z.string().uuid(),
});

operatorsRouter.put("/:id/mappings", authorize("ADMIN"), async (req, res) => {
  const parsed = upsertMappingSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const operator = await prisma.operator.findUnique({ where: { id: String(req.params.id) } });
  if (!operator) {
    throw new HttpError(404, "Operator not found");
  }
  const mapping = await prisma.operatorApiMapping.upsert({
    where: {
      operatorId_priority: { operatorId: operator.id, priority: parsed.data.priority },
    },
    update: { apiProviderId: parsed.data.apiProviderId, isActive: true },
    create: {
      operatorId: operator.id,
      priority: parsed.data.priority,
      apiProviderId: parsed.data.apiProviderId,
    },
    include: { apiProvider: { select: PROVIDER_PUBLIC_SELECT } },
  });
  res.status(201).json({ mapping });
});

const toggleMappingSchema = z
  .object({
    isActive: z.boolean().optional(),
    // The vendor's own code for this operator; empty string clears it.
    providerOperatorCode: z.string().max(50).nullable().optional(),
  })
  .refine((v) => v.isActive !== undefined || v.providerOperatorCode !== undefined, "Nothing to update");

operatorsRouter.patch("/mappings/:mappingId", authorize("ADMIN"), async (req, res) => {
  const parsed = toggleMappingSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, JSON.stringify(parsed.error.flatten()));
  }
  const mapping = await prisma.operatorApiMapping
    .update({
      where: { id: String(req.params.mappingId) },
      data: {
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
        ...(parsed.data.providerOperatorCode !== undefined
          ? { providerOperatorCode: parsed.data.providerOperatorCode?.trim() || null }
          : {}),
      },
      include: { apiProvider: { select: PROVIDER_PUBLIC_SELECT } },
    })
    .catch(() => null);
  if (!mapping) {
    throw new HttpError(404, "Mapping not found");
  }
  res.json({ mapping });
});
