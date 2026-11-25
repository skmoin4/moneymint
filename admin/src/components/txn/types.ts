export interface AdminTxn {
  id: string;
  type: string;
  identifier: string;
  amount: string;
  deduction: string;
  commission: string;
  surcharge: string;
  vendorCommission: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
  providerRefId: string | null;
  apiResponse: Record<string, unknown> | null;
  source: string;
  vendorRefId: string | null;
  statusMessage: string | null;
  createdAt: string;
  updatedAt: string;
  operator: { id: string; name: string; code: string; type: string };
  apiProvider: { id: string; name: string; code: string; walletBalance?: string };
  user: {
    id: string;
    name: string;
    phone: string;
    role: string;
    parent: { id: string; name: string; phone: string } | null;
  };
}

export type StatusSummary = Record<"PENDING" | "SUCCESS" | "FAILED" | "REFUNDED", { count: number; amount: string }>;

export interface ProviderOption {
  id: string;
  name: string;
  code: string;
}

export interface OperatorOption {
  id: string;
  name: string;
  code: string;
  type: string;
}

export const inr = (v: string | number) =>
  `₹ ${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function formatStamp(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Seconds the transaction took to reach its current state (still counting while pending). */
export function procSeconds(t: AdminTxn) {
  const end = t.status === "PENDING" ? Date.now() : new Date(t.updatedAt).getTime();
  return Math.max(0, Math.round((end - new Date(t.createdAt).getTime()) / 1000));
}

/** Readable message from an API error ({ error: "..." } body), for inline alerts. */
export function errorText(err: unknown) {
  const e = err as { response?: { data?: { error?: string } } };
  return e.response?.data?.error ?? "Something went wrong";
}
