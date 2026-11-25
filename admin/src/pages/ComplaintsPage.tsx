import { type FormEvent, useEffect, useState } from "react";
import { MessageSquareWarning, Inbox } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField, inputClasses } from "../components/ui/FormField";

interface Complaint {
  id: string;
  subject: string;
  description: string;
  status: string;
  adminRemarks: string | null;
  createdAt: string;
  user?: { name: string; phone: string };
}

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export function ComplaintsPage() {
  const { user: currentUser } = useAuth();
  const canReview = currentUser?.role !== "RETAILER";

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [own, setOwn] = useState<Complaint[]>([]);
  const [team, setTeam] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);

  function loadAll() {
    setLoading(true);
    Promise.all([
      api.get("/complaints"),
      canReview ? api.get("/complaints/team") : Promise.resolve({ data: { complaints: [] } }),
    ]).then(([ownRes, teamRes]) => {
      setOwn(ownRes.data.complaints);
      setTeam(teamRes.data.complaints);
      setLoading(false);
    });
  }

  useEffect(loadAll, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/complaints", { subject, description });
      setSubject("");
      setDescription("");
      loadAll();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not submit complaint.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    await api.patch(`/complaints/${id}`, { status });
    loadAll();
  }

  return (
    <div>
      <PageHeader title="Complaints" subtitle="Raise an issue or track ones you've already reported." />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <MessageSquareWarning size={18} />
            </div>
            <div className="text-sm font-semibold text-ink-900">Raise a Complaint</div>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FormField label="Subject">
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={inputClasses}
                required
              />
            </FormField>
            <FormField label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className={inputClasses}
                required
              />
            </FormField>
            {error && (
              <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>
            )}
            <Button type="submit" loading={submitting}>
              {submitting ? "Submitting..." : "Submit Complaint"}
            </Button>
          </form>
        </Card>

        <div className="flex flex-col gap-8">
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
              Your Complaints
            </h2>
            {loading ? null : own.length === 0 ? (
              <Card>
                <EmptyState icon={<Inbox size={22} />} message="You haven't raised any complaints." />
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {own.map((c) => (
                  <Card key={c.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-ink-900">{c.subject}</div>
                        <div className="mt-1 text-sm text-ink-500">{c.description}</div>
                        {c.adminRemarks && (
                          <div className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
                            Response: {c.adminRemarks}
                          </div>
                        )}
                      </div>
                      <Badge>{c.status}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {canReview && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
                Team Complaints
              </h2>
              {loading ? null : team.length === 0 ? (
                <Card>
                  <EmptyState icon={<Inbox size={22} />} message="No complaints from your team." />
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {team.map((c) => (
                    <Card key={c.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-ink-900">{c.subject}</div>
                          <div className="text-xs text-ink-500">
                            {c.user?.name} · {c.user?.phone}
                          </div>
                          <div className="mt-1 text-sm text-ink-500">{c.description}</div>
                        </div>
                        <select
                          value={c.status}
                          onChange={(e) => updateStatus(c.id, e.target.value)}
                          className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-500"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s.replace("_", " ")}
                            </option>
                          ))}
                        </select>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
