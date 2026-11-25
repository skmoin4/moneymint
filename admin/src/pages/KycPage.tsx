import { type FormEvent, useEffect, useState } from "react";
import { ShieldCheck, CheckCircle2, XCircle, Clock } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField, inputClasses } from "../components/ui/FormField";

interface KycRequest {
  id: string;
  aadhaarNumber: string;
  panNumber: string;
  status: string;
  remarks: string | null;
  createdAt: string;
  user?: { name: string; phone: string; role: string };
}

export function KycPage() {
  const { user: currentUser } = useAuth();
  const canReview = currentUser?.role !== "RETAILER";

  const [kycStatus, setKycStatus] = useState<string>("NOT_SUBMITTED");
  const [latest, setLatest] = useState<KycRequest | null>(null);
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [pending, setPending] = useState<KycRequest[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);

  function loadSelf() {
    api.get("/kyc/me").then((res) => {
      setKycStatus(res.data.kycStatus);
      setLatest(res.data.latest);
    });
  }

  function loadPending() {
    if (!canReview) return;
    setLoadingPending(true);
    api.get("/kyc/requests", { params: { status: "PENDING" } }).then((res) => {
      setPending(res.data.requests);
      setLoadingPending(false);
    });
  }

  useEffect(() => {
    loadSelf();
    loadPending();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/kyc", { aadhaarNumber, panNumber: panNumber.toUpperCase() });
      setAadhaarNumber("");
      setPanNumber("");
      loadSelf();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not submit KYC.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReview(id: string, action: "approve" | "reject") {
    await api.post(`/kyc/requests/${id}/${action}`, {});
    loadPending();
  }

  const canSubmit = kycStatus === "NOT_SUBMITTED" || kycStatus === "REJECTED";

  return (
    <div>
      <PageHeader title="KYC Verification" subtitle="Verify your identity to unlock higher transaction limits." />

      <div className="grid max-w-md gap-5">
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <ShieldCheck size={18} />
              </div>
              <div className="text-sm font-semibold text-ink-900">Your KYC Status</div>
            </div>
            <Badge>{kycStatus}</Badge>
          </div>

          {latest?.status === "REJECTED" && latest.remarks && (
            <div className="mb-4 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              Rejected: {latest.remarks}
            </div>
          )}

          {canSubmit ? (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <FormField label="Aadhaar Number" hint="12 digits">
                <input
                  value={aadhaarNumber}
                  onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, ""))}
                  maxLength={12}
                  className={inputClasses}
                  required
                />
              </FormField>
              <FormField label="PAN Number" hint="Format: ABCDE1234F">
                <input
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                  maxLength={10}
                  className={inputClasses}
                  required
                />
              </FormField>
              {error && (
                <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>
              )}
              <Button type="submit" loading={submitting}>
                {submitting ? "Submitting..." : "Submit for Verification"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-ink-500">
              {kycStatus === "PENDING"
                ? "Your documents are under review."
                : "Your identity has been verified."}
            </p>
          )}
        </Card>

        {canReview && (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
              Pending Reviews
            </h2>
            {loadingPending ? null : pending.length === 0 ? (
              <Card>
                <EmptyState icon={<Clock size={22} />} message="No pending KYC requests." />
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {pending.map((r) => (
                  <Card key={r.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-semibold text-ink-900">{r.user?.name}</div>
                        <div className="text-xs text-ink-500">{r.user?.phone}</div>
                        <div className="mt-2 text-xs text-ink-500">
                          Aadhaar: {r.aadhaarNumber} · PAN: {r.panNumber}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReview(r.id, "approve")}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          title="Approve"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                        <button
                          onClick={() => handleReview(r.id, "reject")}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
                          title="Reject"
                        >
                          <XCircle size={16} />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
