import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, Lock, Phone, AlertCircle, ShieldCheck, Zap, Users, KeyRound, CheckCircle2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { Button } from "../components/ui/Button";
import { inputClasses } from "../components/ui/FormField";

type Mode = "login" | "forgot-request" | "forgot-reset" | "forgot-done";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<Mode>("login");
  const [resetPhone, setResetPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(phone, password);
      navigate("/");
    } catch {
      setError("Invalid phone or password");
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/password/reset-request", { phone: resetPhone });
      setMode("forgot-reset");
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/password/reset", { phone: resetPhone, otp, newPassword });
      setMode("forgot-done");
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function backToLogin() {
    setMode("login");
    setError("");
    setResetPhone("");
    setOtp("");
    setNewPassword("");
  }

  return (
    <div className="flex min-h-screen bg-ink-50">
      {/* Branding side */}
      <div className="relative hidden w-1/2 overflow-hidden bg-ink-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #6366f1 0%, transparent 45%), radial-gradient(circle at 80% 70%, #4338ca 0%, transparent 45%)",
          }}
        />
        <div className="relative flex items-center gap-2.5 text-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
            <Wallet size={18} />
          </div>
          <span className="text-lg font-bold">MoneyMint</span>
        </div>

        <div className="relative">
          <h1 className="max-w-md text-3xl font-bold leading-tight text-white">
            Recharge & payments infrastructure, built for scale.
          </h1>
          <p className="mt-4 max-w-sm text-sm text-ink-400">
            Manage your retailer network, wallet balances, and transactions from one
            unified dashboard.
          </p>

          <div className="mt-10 flex flex-col gap-4">
            <div className="flex items-center gap-3 text-sm text-ink-300">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
                <Zap size={15} className="text-brand-400" />
              </div>
              Multi-provider failover recharge engine
            </div>
            <div className="flex items-center gap-3 text-sm text-ink-300">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
                <Users size={15} className="text-brand-400" />
              </div>
              Multi-level retailer &amp; distributor hierarchy
            </div>
            <div className="flex items-center gap-3 text-sm text-ink-300">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
                <ShieldCheck size={15} className="text-brand-400" />
              </div>
              Auditable, ledger-backed wallet system
            </div>
          </div>
        </div>

        <p className="relative text-xs text-ink-500">© 2026 MoneyMint. All rights reserved.</p>
      </div>

      {/* Form side */}
      <div className="flex w-full flex-col items-center justify-center px-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Wallet size={18} />
            </div>
            <span className="text-lg font-bold text-ink-900">MoneyMint</span>
          </div>

          {mode === "login" && (
            <>
              <h2 className="text-2xl font-bold text-ink-900">Welcome back</h2>
              <p className="mt-1.5 text-sm text-ink-500">Sign in to your admin panel to continue.</p>

              <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit}>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-700">Phone</label>
                  <div className="relative">
                    <Phone
                      size={16}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
                    />
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Enter your phone number"
                      className={`${inputClasses} pl-10`}
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="block text-sm font-medium text-ink-700">Password</label>
                    <button
                      type="button"
                      onClick={() => setMode("forgot-request")}
                      className="text-xs font-medium text-brand-600 hover:text-brand-700"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock
                      size={16}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
                    />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className={`${inputClasses} pl-10`}
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                    <AlertCircle size={16} className="shrink-0" />
                    {error}
                  </div>
                )}

                <Button type="submit" loading={loading} className="mt-2 w-full py-3">
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </>
          )}

          {mode === "forgot-request" && (
            <>
              <h2 className="text-2xl font-bold text-ink-900">Reset your password</h2>
              <p className="mt-1.5 text-sm text-ink-500">
                Enter your phone number and we'll text you a one-time code.
              </p>

              <form className="mt-8 flex flex-col gap-4" onSubmit={handleRequestOtp}>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-700">Phone</label>
                  <div className="relative">
                    <Phone
                      size={16}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
                    />
                    <input
                      type="text"
                      value={resetPhone}
                      onChange={(e) => setResetPhone(e.target.value)}
                      placeholder="Enter your phone number"
                      className={`${inputClasses} pl-10`}
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                    <AlertCircle size={16} className="shrink-0" />
                    {error}
                  </div>
                )}

                <Button type="submit" loading={loading} className="mt-2 w-full py-3">
                  {loading ? "Sending..." : "Send OTP"}
                </Button>
                <button type="button" onClick={backToLogin} className="text-center text-sm font-medium text-ink-500 hover:text-ink-700">
                  Back to sign in
                </button>
              </form>
            </>
          )}

          {mode === "forgot-reset" && (
            <>
              <h2 className="text-2xl font-bold text-ink-900">Enter the code</h2>
              <p className="mt-1.5 text-sm text-ink-500">
                We sent a 6-digit code to {resetPhone}. It's valid for 5 minutes.
              </p>

              <form className="mt-8 flex flex-col gap-4" onSubmit={handleResetPassword}>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-700">OTP</label>
                  <div className="relative">
                    <KeyRound
                      size={16}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder="6-digit code"
                      className={`${inputClasses} pl-10`}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-700">New Password</label>
                  <div className="relative">
                    <Lock
                      size={16}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
                    />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className={`${inputClasses} pl-10`}
                      minLength={6}
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                    <AlertCircle size={16} className="shrink-0" />
                    {error}
                  </div>
                )}

                <Button type="submit" loading={loading} className="mt-2 w-full py-3">
                  {loading ? "Resetting..." : "Reset Password"}
                </Button>
                <button type="button" onClick={backToLogin} className="text-center text-sm font-medium text-ink-500 hover:text-ink-700">
                  Back to sign in
                </button>
              </form>
            </>
          )}

          {mode === "forgot-done" && (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={24} />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-ink-900">Password reset</h2>
              <p className="mt-1.5 text-sm text-ink-500">
                Your password has been changed. Sign in with your new password below.
              </p>
              <Button onClick={backToLogin} className="mt-6 w-full py-3">
                Back to sign in
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
