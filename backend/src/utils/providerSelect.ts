// Fields of ApiProvider that are safe to embed in transaction/operator responses.
// Never include apiKey/apiSecret: those are vendor credentials, and these responses
// reach retailers and distributors, not just the admin.
export const PROVIDER_PUBLIC_SELECT = {
  id: true,
  name: true,
  code: true,
  providerType: true,
  isActive: true,
} as const;

// Admin-only views additionally show the operational float (the "apibalance" column).
export const PROVIDER_ADMIN_SELECT = {
  ...PROVIDER_PUBLIC_SELECT,
  walletBalance: true,
} as const;
