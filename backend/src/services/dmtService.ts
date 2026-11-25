import { prisma } from "../config/prisma";
import { HttpError } from "../utils/httpError";
import { processProviderTransaction } from "./transactionEngine";

const DMT_OPERATOR_CODE = "DMT";
const UNVERIFIED_REMITTER_LIMIT = 5000;
const VERIFIED_REMITTER_LIMIT = 25000;

export async function registerRemitter(userId: string, name: string, mobileNumber: string) {
  const existing = await prisma.remitter.findUnique({ where: { mobileNumber } });
  if (existing) {
    throw new HttpError(409, "A remitter with this mobile number already exists");
  }
  return prisma.remitter.create({ data: { userId, name, mobileNumber } });
}

export async function verifyRemitter(userId: string, remitterId: string) {
  const remitter = await prisma.remitter.findUnique({ where: { id: remitterId } });
  if (!remitter || remitter.userId !== userId) {
    throw new HttpError(404, "Remitter not found");
  }
  return prisma.remitter.update({ where: { id: remitterId }, data: { isVerified: true } });
}

export async function addBeneficiary(
  userId: string,
  remitterId: string,
  data: { name: string; accountNumber: string; ifsc: string; bankName: string }
) {
  const remitter = await prisma.remitter.findUnique({ where: { id: remitterId } });
  if (!remitter || remitter.userId !== userId) {
    throw new HttpError(404, "Remitter not found");
  }
  return prisma.beneficiary.create({ data: { remitterId, ...data } });
}

export async function transferToBeneficiary(
  userId: string,
  remitterId: string,
  beneficiaryId: string,
  amount: number,
  mode: "IMPS" | "NEFT"
) {
  const remitter = await prisma.remitter.findUnique({ where: { id: remitterId } });
  if (!remitter || remitter.userId !== userId) {
    throw new HttpError(404, "Remitter not found");
  }

  const limit = remitter.isVerified ? VERIFIED_REMITTER_LIMIT : UNVERIFIED_REMITTER_LIMIT;
  if (amount > limit) {
    throw new HttpError(
      400,
      remitter.isVerified
        ? `Amount exceeds the verified remitter limit of ₹${limit}`
        : `Remitter is not KYC-verified. Limit is ₹${limit} until verified.`
    );
  }

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id: beneficiaryId } });
  if (!beneficiary || beneficiary.remitterId !== remitterId) {
    throw new HttpError(404, "Beneficiary not found");
  }

  return processProviderTransaction({
    userId,
    operatorCode: DMT_OPERATOR_CODE,
    identifier: `${beneficiary.accountNumber} - ${beneficiary.name}`,
    amount,
    transactionType: "DMT",
    descriptionLabel: `Money transfer (${mode})`,
  });
}
