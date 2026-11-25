import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, GitBranch } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { PageLoader } from "../components/ui/PageLoader";
import { inputClasses } from "../components/ui/FormField";

interface Provider {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

interface Mapping {
  id: string;
  priority: number;
  isActive: boolean;
  apiProvider: Provider;
}

interface OperatorDetail {
  id: string;
  name: string;
  code: string;
  apiMappings: Mapping[];
}

const PRIORITY_SLOTS = [1, 2, 3, 4, 5];

export function OperatorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [operator, setOperator] = useState<OperatorDetail | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSlot, setSavingSlot] = useState<number | null>(null);

  function load() {
    Promise.all([api.get(`/operators/${id}`), api.get("/providers")]).then(
      ([opRes, provRes]) => {
        setOperator(opRes.data.operator);
        setProviders(provRes.data.providers);
        setLoading(false);
      }
    );
  }

  useEffect(load, [id]);

  async function assignSlot(priority: number, apiProviderId: string) {
    if (!apiProviderId) return;
    setSavingSlot(priority);
    await api.put(`/operators/${id}/mappings`, { priority, apiProviderId });
    load();
    setSavingSlot(null);
  }

  async function toggleMapping(mapping: Mapping) {
    await api.patch(`/operators/mappings/${mapping.id}`, { isActive: !mapping.isActive });
    load();
  }

  if (loading || !operator) return <PageLoader />;

  return (
    <div>
      <Link
        to="/operators"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft size={15} /> Back to Operators
      </Link>

      <PageHeader
        title={`${operator.name} Routing`}
        subtitle="Providers are tried in priority order. If one fails to respond, the next slot is used automatically."
      />

      <Card className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <GitBranch size={18} />
          </div>
          <div className="text-sm font-semibold text-ink-900">Failover Priority Chain</div>
        </div>

        <div className="flex flex-col gap-3">
          {PRIORITY_SLOTS.map((priority) => {
            const mapping = operator.apiMappings.find((m) => m.priority === priority);
            return (
              <div
                key={priority}
                className="flex items-center gap-4 rounded-xl border border-ink-100 p-4"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-600">
                  {priority}
                </div>

                <select
                  className={`${inputClasses} max-w-xs`}
                  value={mapping?.apiProvider.id ?? ""}
                  disabled={savingSlot === priority}
                  onChange={(e) => assignSlot(priority, e.target.value)}
                >
                  <option value="" disabled>
                    Not configured
                  </option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>

                {mapping && (
                  <button
                    onClick={() => toggleMapping(mapping)}
                    className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${
                      mapping.isActive
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 hover:bg-emerald-100"
                        : "bg-ink-100 text-ink-500 ring-ink-500/20 hover:bg-ink-200"
                    }`}
                  >
                    {mapping.isActive ? "Active" : "Disabled"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
