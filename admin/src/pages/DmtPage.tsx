import { type FormEvent, useState } from "react";
import {
  Search,
  UserCheck,
  ShieldCheck,
  UserPlus2,
  Landmark,
  Send,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { FormField, inputClasses } from "../components/ui/FormField";

interface Remitter {
  id: string;
  name: string;
  mobileNumber: string;
  isVerified: boolean;
}

interface Beneficiary {
  id: string;
  name: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
}

interface TransferResult {
  status: string;
  amount: string;
  commission: string;
  providerRefId: string | null;
}

export function DmtPage() {
  const [searchMobile, setSearchMobile] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [remitter, setRemitter] = useState<Remitter | null>(null);
  const [newName, setNewName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [addingBeneficiary, setAddingBeneficiary] = useState(false);

  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"IMPS" | "NEFT">("IMPS");
  const [transferring, setTransferring] = useState(false);
  const [result, setResult] = useState<TransferResult | null>(null);
  const [error, setError] = useState("");

  async function loadBeneficiaries(remitterId: string) {
    const res = await api.get(`/dmt/remitters/${remitterId}/beneficiaries`);
    setBeneficiaries(res.data.beneficiaries);
    setBeneficiaryId((prev) => prev || res.data.beneficiaries[0]?.id || "");
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setSearching(true);
    setError("");
    setResult(null);
    try {
      const res = await api.get("/dmt/remitters/search", { params: { mobileNumber: searchMobile } });
      setRemitter(res.data.remitter);
      setSearched(true);
      if (res.data.remitter) await loadBeneficiaries(res.data.remitter.id);
    } finally {
      setSearching(false);
    }
  }

  async function handleRegister() {
    setRegistering(true);
    setError("");
    try {
      const res = await api.post("/dmt/remitters", { name: newName, mobileNumber: searchMobile });
      setRemitter(res.data.remitter);
      setBeneficiaries([]);
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not register remitter.");
    } finally {
      setRegistering(false);
    }
  }

  async function handleVerify() {
    if (!remitter) return;
    setVerifying(true);
    try {
      const res = await api.post(`/dmt/remitters/${remitter.id}/verify`);
      setRemitter(res.data.remitter);
    } finally {
      setVerifying(false);
    }
  }

  async function handleAddBeneficiary(e: FormEvent) {
    e.preventDefault();
    if (!remitter) return;
    setAddingBeneficiary(true);
    setError("");
    try {
      await api.post(`/dmt/remitters/${remitter.id}/beneficiaries`, {
        name: beneficiaryName,
        accountNumber,
        ifsc,
        bankName,
      });
      setBeneficiaryName("");
      setAccountNumber("");
      setIfsc("");
      setBankName("");
      await loadBeneficiaries(remitter.id);
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not add beneficiary.");
    } finally {
      setAddingBeneficiary(false);
    }
  }

  async function handleTransfer(e: FormEvent) {
    e.preventDefault();
    if (!remitter) return;
    setTransferring(true);
    setError("");
    setResult(null);
    try {
      const res = await api.post("/dmt/transfer", {
        remitterId: remitter.id,
        beneficiaryId,
        amount: Number(amount),
        mode,
      });
      setResult(res.data.transaction);
      setAmount("");
    } catch (err: any) {
      setError(err.response?.data?.error || "Transfer failed.");
    } finally {
      setTransferring(false);
    }
  }

  return (
    <div>
      <PageHeader title="Money Transfer (DMT)" subtitle="Send money from a remitter to any bank account." />

      <div className="grid max-w-md gap-5">
        {/* Step 1: remitter lookup */}
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <UserCheck size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900">Remitter</div>
              <div className="text-xs text-ink-500">Search by mobile number</div>
            </div>
          </div>

          <form className="flex gap-2" onSubmit={handleSearch}>
            <input
              value={searchMobile}
              onChange={(e) => {
                setSearchMobile(e.target.value);
                setSearched(false);
                setRemitter(null);
              }}
              placeholder="Remitter mobile number"
              className={inputClasses}
              required
            />
            <Button type="submit" variant="secondary" loading={searching}>
              <Search size={16} />
            </Button>
          </form>

          {searched && !remitter && (
            <div className="mt-4 rounded-xl border border-ink-100 bg-ink-50/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-ink-500">
                <UserPlus2 size={16} /> No remitter found. Register a new one.
              </div>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Remitter full name"
                className={inputClasses}
              />
              <Button onClick={handleRegister} loading={registering} className="mt-3 w-full">
                Register Remitter
              </Button>
            </div>
          )}

          {remitter && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-ink-100 p-4">
              <div>
                <div className="text-sm font-semibold text-ink-900">{remitter.name}</div>
                <div className="text-xs text-ink-500">{remitter.mobileNumber}</div>
              </div>
              {remitter.isVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <ShieldCheck size={13} /> Verified
                </span>
              ) : (
                <Button variant="secondary" onClick={handleVerify} loading={verifying}>
                  Verify KYC
                </Button>
              )}
            </div>
          )}
        </Card>

        {remitter && (
          <>
            {/* Step 2: beneficiaries */}
            <Card className="p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Landmark size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink-900">Beneficiaries</div>
                  <div className="text-xs text-ink-500">Bank accounts this remitter sends to</div>
                </div>
              </div>

              {beneficiaries.length > 0 && (
                <div className="mb-4 flex flex-col gap-2">
                  {beneficiaries.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-lg border border-ink-100 px-3 py-2 text-sm"
                    >
                      <div className="font-medium text-ink-900">{b.name}</div>
                      <div className="text-xs text-ink-500">
                        {b.accountNumber} · {b.ifsc} · {b.bankName}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <form className="flex flex-col gap-3" onSubmit={handleAddBeneficiary}>
                <input
                  value={beneficiaryName}
                  onChange={(e) => setBeneficiaryName(e.target.value)}
                  placeholder="Beneficiary name"
                  className={inputClasses}
                  required
                />
                <input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Account number"
                  className={inputClasses}
                  required
                />
                <input
                  value={ifsc}
                  onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                  placeholder="IFSC code"
                  className={inputClasses}
                  required
                />
                <input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Bank name"
                  className={inputClasses}
                  required
                />
                <Button type="submit" variant="secondary" loading={addingBeneficiary}>
                  Add Beneficiary
                </Button>
              </form>
            </Card>

            {/* Step 3: transfer */}
            {beneficiaries.length > 0 && (
              <Card className="p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Send size={18} />
                  </div>
                  <div className="text-sm font-semibold text-ink-900">Send Money</div>
                </div>

                <form className="flex flex-col gap-4" onSubmit={handleTransfer}>
                  <FormField label="Beneficiary">
                    <select
                      value={beneficiaryId}
                      onChange={(e) => setBeneficiaryId(e.target.value)}
                      className={inputClasses}
                    >
                      {beneficiaries.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.accountNumber})
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Amount (₹)">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      min="1"
                      className={inputClasses}
                      required
                    />
                  </FormField>
                  <FormField label="Mode">
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as "IMPS" | "NEFT")}
                      className={inputClasses}
                    >
                      <option value="IMPS">IMPS (Instant)</option>
                      <option value="NEFT">NEFT</option>
                    </select>
                  </FormField>
                  <Button type="submit" loading={transferring}>
                    {transferring ? "Sending..." : "Send Money"}
                  </Button>
                </form>
              </Card>
            )}
          </>
        )}

        {error && (
          <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 px-4 py-3.5 text-sm text-rose-700">
            <XCircle size={18} className="shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <div
            className={`rounded-xl px-4 py-4 text-sm ${
              result.status === "SUCCESS" ? "bg-emerald-50" : "bg-rose-50"
            }`}
          >
            <div
              className={`flex items-center gap-2 font-semibold ${
                result.status === "SUCCESS" ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {result.status === "SUCCESS" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              {result.status === "SUCCESS" ? "Transfer Successful" : "Transfer Failed"}
            </div>
            <div className="mt-2 space-y-1 text-ink-600">
              <div>Amount: ₹{result.amount}</div>
              {result.status === "SUCCESS" && Number(result.commission) > 0 && (
                <div>Commission earned: ₹{result.commission}</div>
              )}
              {result.status === "FAILED" && <div>Amount refunded to your wallet.</div>}
              {result.providerRefId && (
                <div className="font-mono text-xs text-ink-400">Ref: {result.providerRefId}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
