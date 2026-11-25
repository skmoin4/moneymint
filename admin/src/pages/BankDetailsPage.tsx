import { type FormEvent, useEffect, useState } from "react";
import { Landmark, Plus, QrCode } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField, inputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  upiId: string | null;
  isActive: boolean;
}

export function BankDetailsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.get("/bank-accounts").then((res) => {
      setAccounts(res.data.accounts);
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/bank-accounts", {
        accountName,
        accountNumber,
        ifsc,
        bankName,
        upiId: upiId || undefined,
      });
      setAccountName("");
      setAccountNumber("");
      setIfsc("");
      setBankName("");
      setUpiId("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not add bank account.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(a: BankAccount) {
    await api.patch(`/bank-accounts/${a.id}`, { isActive: !a.isActive });
    load();
  }

  async function showQr(a: BankAccount) {
    if (qrFor === a.id) {
      setQrFor(null);
      return;
    }
    const res = await api.get(`/bank-accounts/${a.id}/upi-qr`);
    setQrImage(res.data.qrCodeDataUrl);
    setQrFor(a.id);
  }

  return (
    <div>
      <PageHeader
        title="Bank Details"
        subtitle="Accounts your network deposits into when filing a balance request."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Plus size={18} />
            </div>
            <div className="text-sm font-semibold text-ink-900">Add Bank Account</div>
          </div>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FormField label="Account Name">
              <input value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputClasses} required />
            </FormField>
            <FormField label="Account Number">
              <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputClasses} required />
            </FormField>
            <FormField label="IFSC">
              <input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} className={inputClasses} required />
            </FormField>
            <FormField label="Bank Name">
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputClasses} required />
            </FormField>
            <FormField label="UPI ID (optional)" hint="Enables a real scannable QR code, e.g. name@okhdfcbank">
              <input value={upiId} onChange={(e) => setUpiId(e.target.value)} className={inputClasses} />
            </FormField>
            {error && <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}
            <Button type="submit" loading={submitting}>
              {submitting ? "Adding..." : "Add Account"}
            </Button>
          </form>
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Accounts</h2>
          {loading ? null : accounts.length === 0 ? (
            <Card>
              <EmptyState icon={<Landmark size={22} />} message="No bank accounts added yet." />
            </Card>
          ) : (
            <>
              <Table>
                <THead>
                  <Th>Account Name</Th>
                  <Th>Account Number</Th>
                  <Th>IFSC</Th>
                  <Th>Bank</Th>
                  <Th>UPI</Th>
                  <Th>Status</Th>
                  <Th />
                </THead>
                <tbody>
                  {accounts.map((a) => (
                    <Tr key={a.id}>
                      <Td className="font-medium text-ink-900">{a.accountName}</Td>
                      <Td>{a.accountNumber}</Td>
                      <Td className="font-mono text-xs text-ink-500">{a.ifsc}</Td>
                      <Td>{a.bankName}</Td>
                      <Td className="text-ink-500">{a.upiId ?? "-"}</Td>
                      <Td>
                        <button
                          onClick={() => toggleActive(a)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${
                            a.isActive
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 hover:bg-emerald-100"
                              : "bg-ink-100 text-ink-500 ring-ink-500/20 hover:bg-ink-200"
                          }`}
                        >
                          {a.isActive ? "Active" : "Inactive"}
                        </button>
                      </Td>
                      <Td className="text-right">
                        {a.upiId && (
                          <button
                            onClick={() => showQr(a)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                          >
                            <QrCode size={13} /> QR
                          </button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>

              {qrFor && qrImage && (
                <Card className="mt-4 flex flex-col items-center gap-2 p-6">
                  <img src={qrImage} alt="UPI QR code" width={220} height={220} />
                  <p className="text-xs text-ink-500">Scan with any UPI app to pay</p>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
