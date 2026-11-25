export function rateLabel(s: { chargeType: string; commissionType: string; value: string }) {
  const v = s.commissionType === "PERCENT" ? `${Number(s.value)}%` : `₹${Number(s.value)}`;
  return s.chargeType === "SURCHARGE" ? `Surcharge ${v}` : v;
}

export function rangeLabel(s: { minAmount: string | null; maxAmount: string | null }) {
  if (s.minAmount === null && s.maxAmount === null) return "Any amount";
  if (s.maxAmount === null) return `₹${Number(s.minAmount)} and above`;
  if (s.minAmount === null) return `Up to ₹${Number(s.maxAmount)}`;
  return `₹${Number(s.minAmount)} – ₹${Number(s.maxAmount)}`;
}
