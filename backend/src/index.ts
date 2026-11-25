import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { walletRouter } from "./routes/wallet";
import { rechargeRouter } from "./routes/recharge";
import { operatorsRouter } from "./routes/operators";
import { usersRouter } from "./routes/users";
import { providersRouter } from "./routes/providers";
import { commissionRouter } from "./routes/commission";
import { bbpsRouter } from "./routes/bbps";
import { dmtRouter } from "./routes/dmt";
import { kycRouter } from "./routes/kyc";
import { complaintsRouter } from "./routes/complaints";
import { aepsRouter } from "./routes/aeps";
import { bankAccountsRouter } from "./routes/bankAccounts";
import { balanceRequestsRouter } from "./routes/balanceRequests";
import { noticesRouter } from "./routes/notices";
import { securityRouter } from "./routes/security";
import { circlesRouter } from "./routes/circles";
import { settingsRouter } from "./routes/settings";
import { broadcastRouter } from "./routes/broadcast";
import { paymentModesRouter } from "./routes/paymentModes";
import { queuedRechargeRouter } from "./routes/queuedRecharge";
import { manualTxnRouter } from "./routes/manualTxn";
import { dashboardRouter } from "./routes/dashboard";
import { plansRouter } from "./routes/plans";
import { cashbackRouter } from "./routes/cashback";
import { paymentGatewayRouter } from "./routes/paymentGateway";
import { adminTransactionsRouter } from "./routes/adminTransactions";
import { adminPaymentsRouter } from "./routes/adminPayments";
import { partnerApiRouter } from "./routes/partnerApi";
import { apiAccessRouter } from "./routes/apiAccess";
import { appMetaRouter } from "./routes/appMeta";
import { startPartnerCallbackWorker } from "./services/partnerCallbacks";
import { providerCallbackRouter } from "./routes/providerCallback";
import { startStatusPoller } from "./services/statusPoller";
import { errorHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimiters";

const app = express();

// Behind a load balancer / reverse proxy, set TRUST_PROXY (e.g. "1") so req.ip is the real
// client IP — the partner API's IP whitelist and the rate limits depend on it.
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set("trust proxy", /^\d+$/.test(v) ? Number(v) : v);
}

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? "http://localhost:5174",
  })
);
// Keep the exact request bytes: payment webhooks are signed over the raw body, and
// re-serialising the parsed JSON would not reproduce the signature.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);
// Vendor callbacks arrive in bursts from a few vendor IPs; they authenticate with a
// per-provider token, so they sit outside the per-IP API rate limit.
app.use("/callback", providerCallbackRouter);
// Partner (API user) API: token + IP whitelist auth and its own per-token rate limit.
app.use("/api/v1", express.urlencoded({ extended: false }), partnerApiRouter);
app.use(apiLimiter);

app.use("/health", healthRouter);
// The strict auth limiter is applied per-route inside authRouter (login, OTP, password
// reset) — not to /auth/me or PIN endpoints the app calls routinely.
app.use("/auth", authRouter);
// Must be registered before "/wallet" — walletRouter runs `authenticate` unconditionally
// on every path under /wallet, which would 401 the gateway's unauthenticated webhook
// call before it ever reached paymentGatewayRouter's own (signature-based) auth.
app.use("/wallet/add-money", paymentGatewayRouter);
app.use("/wallet", walletRouter);
app.use("/recharge", rechargeRouter);
app.use("/operators", operatorsRouter);
app.use("/users", usersRouter);
app.use("/providers", providersRouter);
app.use("/commission-slabs", commissionRouter);
app.use("/bbps", bbpsRouter);
app.use("/dmt", dmtRouter);
app.use("/kyc", kycRouter);
app.use("/complaints", complaintsRouter);
app.use("/aeps", aepsRouter);
app.use("/bank-accounts", bankAccountsRouter);
app.use("/balance-requests", balanceRequestsRouter);
app.use("/notices", noticesRouter);
app.use("/security", securityRouter);
app.use("/circles", circlesRouter);
app.use("/settings", settingsRouter);
app.use("/broadcast", broadcastRouter);
app.use("/payment-modes", paymentModesRouter);
app.use("/queued-recharge", queuedRechargeRouter);
app.use("/manual-txn", manualTxnRouter);
app.use("/dashboard", dashboardRouter);
app.use("/plans", plansRouter);
app.use("/cashback-offers", cashbackRouter);
app.use("/admin/transactions", adminTransactionsRouter);
app.use("/admin/payments", adminPaymentsRouter);
app.use("/api-access", apiAccessRouter);
app.use("/app", appMetaRouter);

app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  startStatusPoller();
  startPartnerCallbackWorker();
});
