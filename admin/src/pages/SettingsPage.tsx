import { type FormEvent, useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { FormField, inputClasses } from "../components/ui/FormField";

const KNOWN_SETTINGS = [
  { key: "transferCommissionPercent", label: "Transfer Auto-Commission (%)", hint: "Used when 'Auto Calculate Flat Commission' is checked on a fund transfer.", defaultValue: "0.5" },
  { key: "stopAllApiUsers", label: "Stop All API Users", hint: "Manage this from Provider API Setting instead — shown here for visibility.", defaultValue: "false", readOnly: true },
  { key: "referralRewardPercent", label: "Referral Reward (%)", hint: "Percent of every successful transaction credited to the referrer's wallet when a referred user transacts.", defaultValue: "0" },
];

export function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all(KNOWN_SETTINGS.map((s) => api.get(`/settings/${s.key}`))).then((results) => {
      const next: Record<string, string> = {};
      results.forEach((res, i) => {
        next[KNOWN_SETTINGS[i].key] = res.data.value ?? KNOWN_SETTINGS[i].defaultValue;
      });
      setValues(next);
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function handleSave(key: string, e: FormEvent) {
    e.preventDefault();
    setSaving(key);
    try {
      await api.put(`/settings/${key}`, { value: values[key] });
    } finally {
      setSaving(null);
    }
  }

  if (loading) return null;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Platform-wide configuration values." />

      <div className="flex max-w-lg flex-col gap-5">
        {KNOWN_SETTINGS.map((s) => (
          <Card key={s.key} className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Settings2 size={18} />
              </div>
              <div className="text-sm font-semibold text-ink-900">{s.label}</div>
            </div>
            <form className="flex items-end gap-3" onSubmit={(e) => handleSave(s.key, e)}>
              <FormField label="Value" hint={s.hint}>
                <input
                  value={values[s.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                  className={inputClasses}
                  disabled={s.readOnly}
                />
              </FormField>
              {!s.readOnly && (
                <Button type="submit" variant="secondary" loading={saving === s.key}>
                  Save
                </Button>
              )}
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}
