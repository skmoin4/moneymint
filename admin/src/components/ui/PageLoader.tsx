import { Loader2 } from "lucide-react";

export function PageLoader() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-ink-400">
      <Loader2 size={20} className="animate-spin" />
      <span className="text-sm">Loading...</span>
    </div>
  );
}
