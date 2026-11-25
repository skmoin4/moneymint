import { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

// Red "News" tag with the active announcement scrolling beside it. Admins can edit the
// message inline; everyone else just sees the ticker.
export function NoticeBar() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    api
      .get("/notices/active")
      .then((res) => setMessage(res.data.notice?.message ?? null))
      .catch(() => {});
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
    <div className="flex h-7 items-center overflow-hidden border-b border-ink-200 bg-white">
      <span className="news-tag z-10 flex h-7 shrink-0 items-center bg-news px-4 text-[14px] font-semibold text-white">News</span>
      {editing ? (
        <div className="ml-5 flex flex-1 items-center gap-2 pr-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Announcement shown to every user"
            className="min-w-0 flex-1 rounded-[2px] border border-[#e5e6e7] px-2 py-0.5 text-[12.5px] outline-none focus:border-brand-500"
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={saving || !draft.trim()}
            className="rounded-[3px] bg-brand-500 px-2.5 py-0.5 text-[12px] text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Post"}
          </button>
          <button onClick={() => setEditing(false)} className="text-ink-400 hover:text-ink-700" aria-label="Cancel">
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <div className="relative ml-4 min-w-0 flex-1 overflow-hidden">
            <span className="ticker-track text-[12.5px] font-bold text-[#23c6c8]">{message ?? "No announcement set."}</span>
          </div>
          {isAdmin && (
            <button
              onClick={() => {
                setDraft(message ?? "");
                setEditing(true);
              }}
              className="shrink-0 px-3 text-ink-400 hover:text-ink-700"
              title="Edit news"
            >
              <Pencil size={13} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
