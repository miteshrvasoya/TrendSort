import { AlertTriangle } from "lucide-react";

export const isStale = (iso: string | null, hours = 72) =>
  !iso || Date.now() - new Date(iso).getTime() > hours * 3600_000;

export function StaleWarning({ iso, label }: { iso: string | null; label: string }) {
  if (!isStale(iso)) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-lg border border-warn bg-warn/10 px-3 py-2 text-sm text-warn"
    >
      <AlertTriangle size={16} />
      {iso
        ? `${label} last updated ${new Date(iso).toLocaleString()}. Data may be stale.`
        : `${label}: no live data yet. Run a source or import data.`}
    </div>
  );
}
