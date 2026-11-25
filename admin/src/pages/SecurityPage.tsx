import { type FormEvent, useEffect, useState } from "react";
import { ScrollText, MessageSquareText, ShieldAlert, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField, inputClasses } from "../components/ui/FormField";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";

interface ActivityLog {
  id: string;
  action: string;
  ipAddress: string | null;
  details: string | null;
  createdAt: string;
  user: { name: string; phone: string } | null;
}

interface SmsLog {
  id: string;
  toPhone: string;
  message: string;
  purpose: string;
  status: string;
  provider: string;
  createdAt: string;
}

interface IpEntry {
  id: string;
  ipAddress: string;
  description: string | null;
  isActive: boolean;
}

const TABS = ["Activity Logs", "SMS Logs", "IP Whitelist"] as const;

export function SecurityPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Activity Logs");
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);
  const [ipEntries, setIpEntries] = useState<IpEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [ipAddress, setIpAddress] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    Promise.all([
      api.get("/security/activity-logs"),
      api.get("/security/sms-logs"),
      api.get("/security/ip-whitelist"),
    ]).then(([actRes, smsRes, ipRes]) => {
      setActivityLogs(actRes.data.logs);
      setSmsLogs(smsRes.data.logs);
      setIpEntries(ipRes.data.entries);
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function addIp(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/security/ip-whitelist", { ipAddress, description: description || undefined });
      setIpAddress("");
      setDescription("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not add IP.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleIp(entry: IpEntry) {
    await api.patch(`/security/ip-whitelist/${entry.id}`, { isActive: !entry.isActive });
    load();
  }

  async function removeIp(id: string) {
    await api.delete(`/security/ip-whitelist/${id}`);
    load();
  }

  return (
    <div>
      <PageHeader title="Security" subtitle="Login history, SMS delivery, and IP-based access control." />

      <div className="mb-5 flex gap-2 border-b border-ink-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t ? "border-brand-600 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? null : tab === "Activity Logs" ? (
        activityLogs.length === 0 ? (
          <Card>
            <EmptyState icon={<ScrollText size={22} />} message="No activity recorded yet." />
          </Card>
        ) : (
          <Table>
            <THead>
              <Th>Action</Th>
              <Th>User</Th>
              <Th>IP Address</Th>
              <Th>Details</Th>
              <Th>Date</Th>
            </THead>
            <tbody>
              {activityLogs.map((l) => (
                <Tr key={l.id}>
                  <Td>
                    <Badge variant={l.action.includes("FAILED") ? "danger" : "success"}>{l.action}</Badge>
                  </Td>
                  <Td className="font-medium text-ink-900">
                    {l.user ? `${l.user.name} (${l.user.phone})` : "-"}
                  </Td>
                  <Td className="font-mono text-xs text-ink-500">{l.ipAddress ?? "-"}</Td>
                  <Td className="text-ink-500">{l.details ?? "-"}</Td>
                  <Td className="text-ink-500">{new Date(l.createdAt).toLocaleString()}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )
      ) : tab === "SMS Logs" ? (
        smsLogs.length === 0 ? (
          <Card>
            <EmptyState icon={<MessageSquareText size={22} />} message="No SMS sent yet." />
          </Card>
        ) : (
          <Table>
            <THead>
              <Th>To</Th>
              <Th>Purpose</Th>
              <Th>Message</Th>
              <Th>Provider</Th>
              <Th>Status</Th>
              <Th>Date</Th>
            </THead>
            <tbody>
              {smsLogs.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-medium text-ink-900">{s.toPhone}</Td>
                  <Td className="text-ink-500">{s.purpose.replace("_", " ")}</Td>
                  <Td className="max-w-xs truncate normal-case text-ink-600">{s.message}</Td>
                  <Td className="text-ink-500">{s.provider}</Td>
                  <Td>
                    <Badge>{s.status}</Badge>
                  </Td>
                  <Td className="text-ink-500">{new Date(s.createdAt).toLocaleString()}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <Card className="h-fit p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Plus size={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink-900">Whitelist an IP</div>
                <div className="text-xs text-ink-500">
                  Leave empty to allow logins from anywhere (default)
                </div>
              </div>
            </div>
            <form className="flex flex-col gap-4" onSubmit={addIp}>
              <FormField label="IP Address">
                <input value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} className={inputClasses} required />
              </FormField>
              <FormField label="Description (optional)">
                <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClasses} />
              </FormField>
              {error && <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}
              <Button type="submit" loading={submitting}>
                {submitting ? "Adding..." : "Add to Whitelist"}
              </Button>
            </form>
          </Card>

          <div>
            {ipEntries.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<ShieldAlert size={22} />}
                  message="No IPs whitelisted — login is open to all addresses."
                />
              </Card>
            ) : (
              <Table>
                <THead>
                  <Th>IP Address</Th>
                  <Th>Description</Th>
                  <Th>Status</Th>
                  <Th />
                </THead>
                <tbody>
                  {ipEntries.map((e) => (
                    <Tr key={e.id}>
                      <Td className="font-mono text-ink-900">{e.ipAddress}</Td>
                      <Td className="text-ink-500">{e.description ?? "-"}</Td>
                      <Td>
                        <button
                          onClick={() => toggleIp(e)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${
                            e.isActive
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 hover:bg-emerald-100"
                              : "bg-ink-100 text-ink-500 ring-ink-500/20 hover:bg-ink-200"
                          }`}
                        >
                          {e.isActive ? "Active" : "Inactive"}
                        </button>
                      </Td>
                      <Td className="text-right">
                        <button
                          onClick={() => removeIp(e.id)}
                          className="text-ink-400 hover:text-rose-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
