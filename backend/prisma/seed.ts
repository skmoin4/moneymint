import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const RECHARGE_OPERATORS = [
  { name: "Airtel", code: "AIRTEL", type: "PREPAID" },
  { name: "Jio", code: "JIO", type: "PREPAID" },
  { name: "Vodafone Idea", code: "VI", type: "PREPAID" },
  { name: "BSNL", code: "BSNL", type: "PREPAID" },
];

const BILL_OPERATORS = [
  { name: "MSEB Electricity", code: "MSEB", type: "ELECTRICITY" },
  { name: "Tata Power", code: "TATAPOWER", type: "ELECTRICITY" },
  { name: "Bharat Gas", code: "BHARATGAS", type: "GAS" },
];

const DMT_OPERATORS = [{ name: "Money Transfer", code: "DMT", type: "DMT" }];

const AEPS_OPERATORS = [{ name: "Aadhaar Banking", code: "AEPS", type: "AEPS" }];

// DTH, FASTag, and OTT all route through the exact same generic recharge engine as
// mobile prepaid (POST /recharge with an operatorCode + identifier + amount) — no
// engine code is DTH/FASTag/OTT-specific, they just need Operator rows to exist.
const DTH_OPERATORS = [
  { name: "Tata Play", code: "TATAPLAY", type: "DTH" },
  { name: "Dish TV", code: "DISHTV", type: "DTH" },
  { name: "Airtel Digital TV", code: "AIRTELDTH", type: "DTH" },
];

const FASTAG_OPERATORS = [
  { name: "ICICI FASTag", code: "ICICIFASTAG", type: "FASTAG" },
  { name: "Paytm FASTag", code: "PAYTMFASTAG", type: "FASTAG" },
];

const OTT_OPERATORS = [
  { name: "Netflix", code: "NETFLIX", type: "OTT" },
  { name: "Amazon Prime Video", code: "PRIMEVIDEO", type: "OTT" },
  { name: "Disney+ Hotstar", code: "HOTSTAR", type: "OTT" },
];

const PROVIDERS = [
  {
    name: "Mock Provider Primary",
    code: "MOCK1",
    providerType: "RECHARGE" as const,
    baseUrl: "https://mock1.local",
    apiKey: "mock-key-1",
    apiSecret: "mock-secret-1",
  },
  {
    name: "Mock Provider Backup",
    code: "MOCK2",
    providerType: "RECHARGE" as const,
    baseUrl: "https://mock2.local",
    apiKey: "mock-key-2",
    apiSecret: "mock-secret-2",
  },
  {
    name: "Mock BBPS Provider",
    code: "MOCKBBPS",
    providerType: "BBPS" as const,
    baseUrl: "https://mockbbps.local",
    apiKey: "mock-bbps-key",
    apiSecret: "mock-bbps-secret",
  },
  {
    name: "Mock DMT Provider",
    code: "MOCKDMT",
    providerType: "DMT" as const,
    baseUrl: "https://mockdmt.local",
    apiKey: "mock-dmt-key",
    apiSecret: "mock-dmt-secret",
  },
  {
    name: "Mock AEPS Provider",
    code: "MOCKAEPS",
    providerType: "AEPS" as const,
    baseUrl: "https://mockaeps.local",
    apiKey: "mock-aeps-key",
    apiSecret: "mock-aeps-secret",
  },
];

async function seedOperatorGroup(
  standardPackId: string,
  operators: { name: string; code: string; type: string }[],
  providerCodes: string[],
  commissionType: "PERCENT" | "FLAT",
  commissionValue: number
) {
  const providers = await Promise.all(
    providerCodes.map((code) => prisma.apiProvider.findUniqueOrThrow({ where: { code } }))
  );

  for (const op of operators) {
    const operator = await prisma.operator.upsert({
      where: { code: op.code },
      update: {},
      create: op,
    });

    for (let i = 0; i < providers.length; i++) {
      const priority = i + 1;
      await prisma.operatorApiMapping.upsert({
        where: { operatorId_priority: { operatorId: operator.id, priority } },
        update: { apiProviderId: providers[i].id },
        create: { operatorId: operator.id, apiProviderId: providers[i].id, priority },
      });
    }

    const hasSlab = await prisma.commissionSlab.findFirst({ where: { packId: standardPackId, operatorId: operator.id } });
    if (!hasSlab) {
      await prisma.commissionSlab.create({
        data: { packId: standardPackId, operatorId: operator.id, commissionType, value: commissionValue },
      });
    }
  }
}

async function main() {
  for (const p of PROVIDERS) {
    await prisma.apiProvider.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    });
  }

  const standardPack = await prisma.commissionPack.upsert({
    where: { name: "Standard Pack" },
    update: {},
    create: { name: "Standard Pack" },
  });

  await seedOperatorGroup(standardPack.id, RECHARGE_OPERATORS, ["MOCK1", "MOCK2"], "PERCENT", 2.0);
  await seedOperatorGroup(standardPack.id, BILL_OPERATORS, ["MOCKBBPS"], "PERCENT", 1.0);
  await seedOperatorGroup(standardPack.id, DMT_OPERATORS, ["MOCKDMT"], "FLAT", 5.0);
  await seedOperatorGroup(standardPack.id, AEPS_OPERATORS, ["MOCKAEPS"], "FLAT", 15.0);
  await seedOperatorGroup(standardPack.id, DTH_OPERATORS, ["MOCK1", "MOCK2"], "PERCENT", 2.0);
  await seedOperatorGroup(standardPack.id, FASTAG_OPERATORS, ["MOCK1", "MOCK2"], "PERCENT", 1.0);
  await seedOperatorGroup(standardPack.id, OTT_OPERATORS, ["MOCK1", "MOCK2"], "PERCENT", 1.5);

  const CIRCLES = [
    { name: "Delhi NCR", code: "DEL", state: "Delhi" },
    { name: "Mumbai", code: "MUM", state: "Maharashtra" },
    { name: "Maharashtra", code: "MAH", state: "Maharashtra" },
    { name: "Karnataka", code: "KTK", state: "Karnataka" },
    { name: "Tamil Nadu", code: "TN", state: "Tamil Nadu" },
    { name: "Gujarat", code: "GUJ", state: "Gujarat" },
    { name: "Uttar Pradesh (East)", code: "UPE", state: "Uttar Pradesh" },
    { name: "Uttar Pradesh (West)", code: "UPW", state: "Uttar Pradesh" },
  ];
  for (const c of CIRCLES) {
    await prisma.circle.upsert({ where: { code: c.code }, update: {}, create: c });
  }

  // Give each provider a small monthly rent so "Debit Rent" has something real to deduct.
  await prisma.apiProvider.updateMany({ data: { rentAmount: 500 } });

  // Fund each provider's operational float (Wallet 1) so recharges actually have real
  // balance to draw from — without this every transaction would fail immediately.
  await prisma.apiProvider.updateMany({ data: { walletBalance: 50000 } });

  const PAYMENT_MODES = ["CASH", "UPI", "NEFT", "IMPS", "BANK_TRANSFER"];
  for (const name of PAYMENT_MODES) {
    await prisma.paymentMode.upsert({ where: { name }, update: {}, create: { name } });
  }

  console.log("Seed complete: operators, providers, mappings, one Standard commission pack covering every operator, circles, rent amounts, payment modes.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
