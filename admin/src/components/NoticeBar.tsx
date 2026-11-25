import { useEffect, useState } from "react";
import { Megaphone, Pencil, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function NoticeBar() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    api.get("/notices/active").then((res) => {
      setMessage(res.data.notice?.message ?? null);
    });
  }

  useEffect(load, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.post("/notices", { message: draft });
      setEditing(false);
      setDraft("");
      load();
    } finally {
      setSaving(false);
    }
  }

  if (!message && !isAdmin) return null;

  return (
    <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800">
      <Megaphone size={15} className="shrink-0" />
      {editing ? (
        <div className="flex flex-1 items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Announcement message"
            className="flex-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-sm outline-none"
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Post"}
          </button>
          <button onClick={() => setEditing(false)} className="text-amber-600">
            <X size={15} />
          </button>
        </div>
      ) : (
        <>
          <span className="flex-1 truncate">{message ?? "No announcement set."}</span>
          {isAdmin && (
            <button
              onClick={() => {
                setDraft(message ?? "");
                setEditing(true);
              }}
              className="shrink-0 text-amber-600 hover:text-amber-800"
              title="Edit announcement"
            >
              <Pencil size={14} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
